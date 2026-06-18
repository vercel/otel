import { trace } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sdk } from "./sdk";
import type { VercelRequestContext } from "./vercel-request-context/api";

const requestContextSymbol = Symbol.for("@vercel/request-context");
const originalEnv = process.env;

let activeContext: VercelRequestContext | undefined;

beforeEach(() => {
  activeContext = undefined;
  process.env = { ...originalEnv };
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
  delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS;
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL;
  delete process.env.VERCEL_OTEL_ENDPOINTS;
  delete process.env.VERCEL_OTEL_ENDPOINTS_PORT;
  delete process.env.VERCEL_OTEL_ENDPOINTS_PROTOCOL;
  Reflect.set(globalThis, requestContextSymbol, {
    get: () => activeContext,
  });
});

afterEach(() => {
  trace.disable();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, requestContextSymbol);
  process.env = originalEnv;
});

describe("Sdk trace export", () => {
  it("keeps automatic local OTLP export without trace drains", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", fetchMock);

    await exportOneSpan();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4318/v1/traces",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("skips automatic local OTLP export when trace drains are configured", async () => {
    activeContext = createDrainingContext();
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", fetchMock);

    await exportOneSpan();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips automatic local OTLP export when trace drain context is lost before span end", async () => {
    activeContext = createDrainingContext();
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", fetchMock);

    await exportOneSpan(() => {
      activeContext = undefined;
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function exportOneSpan(beforeEnd?: () => void): Promise<void> {
  const sdk = new Sdk({
    autoDetectResources: false,
    instrumentations: [],
    serviceName: "test-service",
  });
  sdk.start();
  const span = trace.getTracer("test").startSpan("test span");
  beforeEnd?.();
  span.end();
  await sdk.shutdown();
}

function createDrainingContext(): VercelRequestContext {
  return {
    headers: {},
    telemetry: {
      reportSpans: vi.fn(),
      traceDrains: ["traceful.dev"],
    },
    url: "https://example.com",
    waitUntil: vi.fn(),
  };
}
