import { describe, expect, it } from "vitest";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type {
  ReadableSpan,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { createTraceServiceRequest } from "../exporters/trace-service-request";
import { PartialSpanProcessor } from "./partial-span-processor";

describe("PartialSpanProcessor", () => {
  it("exports a start snapshot and a final snapshot", async () => {
    const exportedSpans: ReadableSpan[][] = [];
    const exporter = createExporter(exportedSpans);
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new PartialSpanProcessor(exporter, { scheduledDelayMillis: 60_000 }),
      ],
    });

    const span = provider.getTracer("test").startSpan("partial-span");
    span.setAttribute("phase", "started");

    await provider.forceFlush();

    span.setAttribute("phase", "ended");
    span.end();
    await provider.forceFlush();

    expect(exportedSpans).toHaveLength(2);
    expect(exportedSpans[0]?.[0]?.ended).toBe(false);
    expect(exportedSpans[0]?.[0]?.attributes.phase).toBe("started");
    expect(exportedSpans[1]?.[0]?.ended).toBe(true);
    expect(exportedSpans[1]?.[0]?.attributes.phase).toBe("ended");

    await provider.shutdown();
  });

  it("omits the OTLP end time for partial snapshots", async () => {
    const exportedSpans: ReadableSpan[][] = [];
    const exporter = createExporter(exportedSpans);
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new PartialSpanProcessor(exporter, { scheduledDelayMillis: 60_000 }),
      ],
    });

    const span = provider.getTracer("test").startSpan("partial-span");
    await provider.forceFlush();
    span.end();
    await provider.forceFlush();

    const partialSpan = exportedSpans[0]?.[0];
    const finalSpan = exportedSpans[1]?.[0];
    expect(partialSpan).toBeDefined();
    expect(finalSpan).toBeDefined();
    if (!partialSpan || !finalSpan) {
      throw new Error("Expected partial and final spans to be exported");
    }

    const request = createTraceServiceRequest([partialSpan, finalSpan], {
      useHex: true,
      useLongBits: false,
    });
    const otlpSpans = request.resourceSpans?.[0]?.scopeSpans[0]?.spans;

    expect(otlpSpans?.[0]).not.toHaveProperty("endTimeUnixNano");
    expect(otlpSpans?.[1]).toHaveProperty("endTimeUnixNano");

    await provider.shutdown();
  });

  it("does not export a partial snapshot when the span ends before flush", async () => {
    const exportedSpans: ReadableSpan[][] = [];
    const exporter = createExporter(exportedSpans);
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new PartialSpanProcessor(exporter, { scheduledDelayMillis: 60_000 }),
      ],
    });

    const span = provider.getTracer("test").startSpan("short-span");
    span.end();
    await provider.forceFlush();

    expect(exportedSpans).toHaveLength(1);
    expect(exportedSpans[0]?.[0]?.name).toBe("short-span");
    expect(exportedSpans[0]?.[0]?.ended).toBe(true);

    await provider.shutdown();
  });

  it("keeps a zero OTLP end time for spans that are marked ended", async () => {
    const exportedSpans: ReadableSpan[][] = [];
    const exporter = createExporter(exportedSpans);
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new PartialSpanProcessor(exporter, { scheduledDelayMillis: 60_000 }),
      ],
    });

    const span = provider.getTracer("test").startSpan("epoch-ended-span");
    await provider.forceFlush();

    const partialSpan = exportedSpans[0]?.[0];
    expect(partialSpan).toBeDefined();
    if (!partialSpan) {
      throw new Error("Expected a partial span to be exported");
    }

    const endedZeroSpan: ReadableSpan = { ...partialSpan, ended: true };
    const request = createTraceServiceRequest([endedZeroSpan], {
      useHex: true,
      useLongBits: false,
    });
    const otlpSpan = request.resourceSpans?.[0]?.scopeSpans[0]?.spans?.[0];

    expect(otlpSpan).toHaveProperty("endTimeUnixNano", "0");

    span.end();
    await provider.shutdown();
  });
});

function createExporter(exportedSpans: ReadableSpan[][]): SpanExporter {
  return {
    export(
      spans: ReadableSpan[],
      resultCallback: (result: ExportResult) => void,
    ): void {
      exportedSpans.push(spans);
      resultCallback({ code: ExportResultCode.SUCCESS });
    },
    shutdown(): Promise<void> {
      return Promise.resolve();
    },
  };
}
