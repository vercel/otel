import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace";
import { afterEach, describe, expect, it } from "vitest";
import type { OTLPExporterConfig } from "./config";
import { OTLPHttpJsonTraceExporter } from "./exporter-trace-otlp-http-fetch";
import { OTLPHttpProtoTraceExporter } from "./exporter-trace-otlp-proto-fetch";

const exporters = {
  OTLPHttpProtoTraceExporter,
  OTLPHttpJsonTraceExporter,
} as const;

describe.each([
  ["OTLPHttpProtoTraceExporter", "application/x-protobuf", true],
  ["OTLPHttpJsonTraceExporter", "application/json", false],
] as const)("%s", (name, contentType, sendsAccept) => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function create(config?: OTLPExporterConfig): SpanExporter & {
    forceFlush: () => Promise<void>;
  } {
    return new exporters[name](config);
  }

  it("POSTs a non-empty body with the protocol content type to the configured url", async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }));
    const exporter = create({
      url: "https://collector.example/v1/traces",
      headers: { "x-api-key": "secret" },
    });
    await exportSpan(exporter, await oneSpan());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://collector.example/v1/traces");
    expect(calls[0]?.init.method).toBe("POST");
    expect(header(calls[0]?.init, "Content-Type")).toBe(contentType);
    expect(header(calls[0]?.init, "x-api-key")).toBe("secret");
    expect(header(calls[0]?.init, "accept")).toBe(
      sendsAccept ? "application/x-protobuf" : undefined,
    );
    const body = calls[0]?.init.body;
    expect(body).toBeInstanceOf(Uint8Array);
    expect((body as Uint8Array).byteLength).toBeGreaterThan(0);
  });

  it("defaults the url to http://localhost:4318/v1/traces", async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }));
    await exportSpan(create(), await oneSpan());
    expect(calls[0]?.url).toBe("http://localhost:4318/v1/traces");
  });

  it("reports SUCCESS after the response and FAILED when fetch rejects", async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    const success = await exportSpan(create(), await oneSpan());
    expect(success.code).toBe(ExportResultCode.SUCCESS);

    stubFetch(() => Promise.reject(new Error("down")));
    const failed = await exportSpan(create(), await oneSpan());
    expect(failed.code).toBe(ExportResultCode.FAILED);
    expect(failed.error).toBeInstanceOf(Error);
    expect(failed.error?.message).toBe("down");
  });

  it("forceFlush waits for in-flight requests; export after shutdown sends nothing", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = stubFetch(() => gate.then(() => new Response(null, { status: 200 })));
    const exporter = create();
    const span = await oneSpan();
    let flushed = false;
    const pending = exportSpan(exporter, span);
    const flush = exporter.forceFlush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(calls).toHaveLength(1);
    release();
    await flush;
    expect(flushed).toBe(true);
    await pending;

    await exporter.shutdown();
    calls.length = 0;
    exporter.export([span], () => undefined);
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });
});

function stubFetch(
  respond: () => Response | Promise<Response>,
): { url: string; init: RequestInit }[] {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return calls;
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) {
    return undefined;
  }
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

async function oneSpan(): Promise<ReadableSpan> {
  const memory = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: memory })],
  });
  const span = provider.getTracer("exporters").startSpan("op");
  span.setAttribute("k", "v");
  span.end();
  const finished = memory.getFinishedSpans()[0];
  await provider.shutdown();
  if (!finished) {
    throw new Error("span was not finished");
  }
  return finished;
}

function exportSpan(
  exporter: {
    export: (
      spans: ReadableSpan[],
      resultCallback: (result: ExportResult) => void,
    ) => void;
  },
  span: ReadableSpan,
): Promise<ExportResult> {
  return new Promise((resolve) => {
    exporter.export([span], resolve);
  });
}
