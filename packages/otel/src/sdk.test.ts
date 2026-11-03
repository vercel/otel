import * as http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROOT_CONTEXT,
  context,
  defaultTextMapGetter,
  propagation,
  trace,
} from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Configuration } from "./types";
import { Sdk } from "./sdk";

describe("Sdk propagators", () => {
  let sdk: Sdk | undefined;

  afterEach(async () => {
    await sdk?.shutdown();
    sdk = undefined;
    propagation.disable();
    trace.disable();
    context.disable();
  });

  function extractedBaggageEntries(
    propagators: Configuration["propagators"],
    header: string,
  ): number {
    sdk = new Sdk({ propagators, instrumentations: [], spanProcessors: [] });
    sdk.start();
    const extracted = propagation.extract(
      ROOT_CONTEXT,
      { baggage: header },
      defaultTextMapGetter,
    );
    return propagation.getBaggage(extracted)?.getAllEntries().length ?? 0;
  }

  const oversizedHeader = Array.from(
    { length: 5000 },
    (_, i) => `k${i}=v`,
  ).join(",");

  it.each([["auto"], ["baggage"]] as const)(
    "limits inbound baggage entries with the %s propagator",
    (propagator) => {
      expect(extractedBaggageEntries([propagator], oversizedHeader)).toBe(180);
    },
  );
});

describe("Sdk span processors", () => {
  let sdk: Sdk | undefined;

  afterEach(async () => {
    await sdk?.shutdown();
    sdk = undefined;
    propagation.disable();
    trace.disable();
    context.disable();
  });

  it("lets a configured processor's onEnding change attributes before export", () => {
    const redactor: SpanProcessor = {
      onStart: () => undefined,
      onEnding(span) {
        span.setAttribute("secret", "[redacted]");
      },
      onEnd: () => undefined,
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    const exporter = new InMemorySpanExporter();
    sdk = new Sdk({
      instrumentations: [],
      spanProcessors: [redactor, new SimpleSpanProcessor(exporter)],
    });
    sdk.start();
    const span = trace.getTracer("test").startSpan("op");
    span.setAttribute("secret", "hunter2");
    span.end();
    expect(exporter.getFinishedSpans()[0]?.attributes.secret).toBe(
      "[redacted]",
    );
  });
});

describe("Sdk in a Vercel Daemon", () => {
  let server: http.Server | undefined;
  const socketPath = join(mkdtempSync(join(tmpdir(), "otel-")), "otlp.sock");

  afterEach(async () => {
    await new Promise((resolve) => {
      server?.close(resolve);
    });
    server = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    propagation.disable();
    trace.disable();
    context.disable();
  });

  interface ReceivedRequest {
    url?: string;
    contentType?: string;
  }

  async function listenOnDaemonSocket(): Promise<ReceivedRequest[]> {
    const received: ReceivedRequest[] = [];
    server = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        received.push({
          url: req.url,
          contentType: req.headers["content-type"],
        });
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      server?.listen(socketPath, resolve);
    });
    return received;
  }

  async function exportOneSpan(): Promise<void> {
    vi.stubEnv("VERCEL_OTEL_SOCKET_PATH", socketPath);
    const sdk = new Sdk({ instrumentations: [] });
    sdk.start();
    trace.getTracer("test").startSpan("work").end();
    await sdk.shutdown();
  }

  it("sends spans as protobuf to VERCEL_OTEL_SOCKET_PATH", async () => {
    const received = await listenOnDaemonSocket();

    await exportOneSpan();

    expect(received).toEqual([
      { url: "/v1/traces", contentType: "application/x-protobuf" },
    ]);
  });

  it("prefers OTEL_EXPORTER_OTLP_ENDPOINT over VERCEL_OTEL_SOCKET_PATH", async () => {
    const received = await listenOnDaemonSocket();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318");
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", fetchMock);

    await exportOneSpan();

    expect(received).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://collector:4318/v1/traces",
      expect.anything(),
    );
  });
});
