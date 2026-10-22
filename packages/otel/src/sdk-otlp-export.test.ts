import { context, trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it } from "vitest";
import { Sdk } from "./sdk";

const ENV_KEYS = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
  "VERCEL_OTEL_ENDPOINTS",
  "OTEL_SDK_DISABLED",
] as const;

describe("default OTLP export", () => {
  const previous = new Map<string, string | undefined>();
  let restoreFetch: (() => void) | undefined;

  afterEach(async () => {
    restoreFetch?.();
    restoreFetch = undefined;
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    trace.disable();
    context.disable();
  });

  function isolateEnv(): void {
    for (const key of ENV_KEYS) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
  }

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

  it("does not post to localhost when no OTLP endpoint is set", async () => {
    isolateEnv();
    const calls = spyOnFetch();
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

    expect(calls.filter((url) => url.includes("/v1/traces"))).toEqual([]);
  });

  it("posts to the configured OTLP endpoint", async () => {
    isolateEnv();
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT =
      "http://collector.test/v1/traces";
    const calls = spyOnFetch();
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

    expect(calls).toContain("http://collector.test/v1/traces");
  });
});
