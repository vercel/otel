import { context, trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it } from "vitest";
import type { VercelRequestContext } from "./vercel-request-context/api";
import { Sdk } from "./sdk";

const requestContextSymbol = Symbol.for("@vercel/request-context");

describe("localhost OTLP export", () => {
  let restoreFetch: (() => void) | undefined;
  let restoreContext: (() => void) | undefined;

  afterEach(async () => {
    restoreFetch?.();
    restoreFetch = undefined;
    restoreContext?.();
    restoreContext = undefined;
    trace.disable();
    context.disable();
  });

  function spyOnFetch(): string[] {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };
    return calls;
  }

  function setRequestContext(telemetry: VercelRequestContext["telemetry"]): void {
    const globalObject = globalThis as {
      [requestContextSymbol]?: { get: () => VercelRequestContext | undefined };
    };
    const previous = globalObject[requestContextSymbol];
    globalObject[requestContextSymbol] = {
      get: () =>
        telemetry
          ? {
              waitUntil() {},
              headers: {},
              url: "https://example.com/",
              telemetry,
            }
          : undefined,
    };
    restoreContext = () => {
      if (previous === undefined) {
        delete globalObject[requestContextSymbol];
      } else {
        globalObject[requestContextSymbol] = previous;
      }
    };
  }

  async function exportOneSpan(): Promise<void> {
    const sdk = new Sdk({
      autoDetectResources: false,
      instrumentations: [],
      resourceDetectors: [],
      serviceName: "test",
    });
    sdk.start();
    const span = trace.getTracer("test").startSpan("checkout.wait");
    span.end();
    await sdk.shutdown();
  }

  it("posts to localhost when Vercel is not exporting", async () => {
    const calls = spyOnFetch();

    await exportOneSpan();

    expect(calls).toContain("http://localhost:4318/v1/traces");
  });

  it("still posts to localhost when the request context has no tracing flag", async () => {
    const calls = spyOnFetch();
    setRequestContext({
      reportSpans() {},
    });

    await exportOneSpan();

    expect(calls).toContain("http://localhost:4318/v1/traces");
  });

  it("does not post to localhost when Vercel tracing is enabled", async () => {
    const calls = spyOnFetch();
    setRequestContext({
      reportSpans() {},
      vercelTracing: true,
    });

    await exportOneSpan();

    expect(calls.filter((url) => url.includes("/v1/traces"))).toEqual([]);
  });
});
