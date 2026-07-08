import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, hrTime } from "@opentelemetry/core";
import { TraceFlags, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { VercelRequestContext } from "./api";
import { finalizeTrace, registerVercelRequestContextForTrace } from "./api";
import { VercelRuntimeSpanExporter } from "./exporter";

const TRACE_A = "aa75cd9e534ff5e9ed78b4a0c706f0f2";
const TRACE_B = "bb75cd9e534ff5e9ed78b4a0c706f0f2";
const VRC_SYMBOL = Symbol.for("@vercel/request-context");

type GlobalWithReader = Record<symbol, unknown>;

function createSpan(spanId: string, traceId = TRACE_A): ReadableSpan {
  const spanContext = {
    traceId,
    spanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: false,
  };
  return {
    name: `span-${spanId}`,
    kind: SpanKind.INTERNAL,
    spanContext: () => spanContext,
    parentSpanContext: undefined,
    startTime: hrTime(1),
    endTime: hrTime(2),
    status: { code: SpanStatusCode.UNSET },
    attributes: {},
    links: [],
    events: [],
    duration: hrTime(1),
    ended: true,
    resource: resourceFromAttributes({}),
    instrumentationScope: { name: "default" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
}

function makeContext(): {
  ctx: VercelRequestContext;
  reportSpans: ReturnType<typeof vi.fn>;
} {
  const reportSpans = vi.fn();
  const ctx: VercelRequestContext = {
    waitUntil: () => undefined,
    headers: {},
    url: "https://example.com",
    telemetry: { reportSpans },
  };
  return { ctx, reportSpans };
}

function installAmbient(ctx: VercelRequestContext | undefined): void {
  (globalThis as GlobalWithReader)[VRC_SYMBOL] = { get: () => ctx };
}

function shippedTraceIds(
  reportSpans: ReturnType<typeof vi.fn>,
  call = 0,
): string[] {
  const data = reportSpans.mock.calls[call]?.[0] as IExportTraceServiceRequest;
  return (data.resourceSpans ?? []).flatMap((rs) =>
    rs.scopeSpans.flatMap((ss) =>
      (ss.spans ?? []).map((s) => String(s.traceId)),
    ),
  );
}

function shippedSpanCount(
  reportSpans: ReturnType<typeof vi.fn>,
  call = 0,
): number {
  return shippedTraceIds(reportSpans, call).length;
}

function makeStreamingExporter(): VercelRuntimeSpanExporter {
  process.env.VERCEL_OTEL_STREAM_SPANS = "1";
  try {
    return new VercelRuntimeSpanExporter();
  } finally {
    delete process.env.VERCEL_OTEL_STREAM_SPANS;
  }
}

describe("VercelRuntimeSpanExporter (streaming mode, VERCEL_OTEL_STREAM_SPANS=1)", () => {
  afterEach(() => {
    installAmbient(undefined);
    // Clear any registrations left behind by a test.
    finalizeTrace(TRACE_A);
    finalizeTrace(TRACE_B);
    vi.restoreAllMocks();
  });

  it("streams a registered trace's spans on every flush, as single-trace payloads", () => {
    const owner = makeContext();
    registerVercelRequestContextForTrace(TRACE_A, owner.ctx);
    installAmbient(undefined);

    const exporter = makeStreamingExporter();
    const result = vi.fn();
    exporter.export([createSpan("0000000000000001", TRACE_A)], result);
    exporter.export([createSpan("0000000000000002", TRACE_A)], result);

    expect(result).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });
    // Two mid-run flushes -> two reports, each shipped immediately.
    expect(owner.reportSpans).toHaveBeenCalledTimes(2);
    expect(shippedSpanCount(owner.reportSpans, 0)).toBe(1);
    expect(shippedSpanCount(owner.reportSpans, 1)).toBe(1);

    // Finalize with an empty buffer reports nothing further.
    finalizeTrace(TRACE_A);
    expect(owner.reportSpans).toHaveBeenCalledTimes(2);
  });

  it("never mixes traces into one payload: each trace ships separately to its own context", () => {
    const ownerA = makeContext();
    const ownerB = makeContext();
    registerVercelRequestContextForTrace(TRACE_A, ownerA.ctx);
    registerVercelRequestContextForTrace(TRACE_B, ownerB.ctx);

    const exporter = makeStreamingExporter();
    exporter.export(
      [
        createSpan("0000000000000001", TRACE_A),
        createSpan("0000000000000002", TRACE_B),
        createSpan("0000000000000003", TRACE_A),
      ],
      vi.fn(),
    );

    expect(ownerA.reportSpans).toHaveBeenCalledTimes(1);
    expect(ownerB.reportSpans).toHaveBeenCalledTimes(1);
    expect(new Set(shippedTraceIds(ownerA.reportSpans))).toEqual(
      new Set([TRACE_A]),
    );
    expect(shippedSpanCount(ownerA.reportSpans)).toBe(2);
    expect(new Set(shippedTraceIds(ownerB.reportSpans))).toEqual(
      new Set([TRACE_B]),
    );
    expect(shippedSpanCount(ownerB.reportSpans)).toBe(1);
  });

  it("ships untracked traces through the ambient context, still one payload per trace", () => {
    const ambient = makeContext();
    installAmbient(ambient.ctx);

    const exporter = makeStreamingExporter();
    exporter.export(
      [
        createSpan("0000000000000001", TRACE_A),
        createSpan("0000000000000002", TRACE_B),
      ],
      vi.fn(),
    );

    // Two payloads (one per trace), never a mixed one.
    expect(ambient.reportSpans).toHaveBeenCalledTimes(2);
    expect(new Set(shippedTraceIds(ambient.reportSpans, 0)).size).toBe(1);
    expect(new Set(shippedTraceIds(ambient.reportSpans, 1)).size).toBe(1);
  });

  it("buffers spans with no reachable channel and ships them on a later flush", () => {
    const exporter = makeStreamingExporter();

    installAmbient(undefined);
    const firstResult = vi.fn();
    exporter.export([createSpan("0000000000000001", TRACE_B)], firstResult);
    expect(firstResult).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });

    const { ctx, reportSpans } = makeContext();
    installAmbient(ctx);
    exporter.export([createSpan("0000000000000002", TRACE_B)], vi.fn());

    // Buffered + incoming ship together (same trace, one payload).
    expect(reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanCount(reportSpans)).toBe(2);
  });

  it("ships leftovers at finalizeTrace through the owning context", () => {
    const exporter = makeStreamingExporter();

    // No channel at flush time: spans stay buffered.
    installAmbient(undefined);
    exporter.export([createSpan("0000000000000001", TRACE_A)], vi.fn());

    // The trace's request registers + finalizes (waitUntil path).
    const owner = makeContext();
    registerVercelRequestContextForTrace(TRACE_A, owner.ctx);
    finalizeTrace(TRACE_A);

    expect(owner.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanCount(owner.reportSpans)).toBe(1);
  });

  it("retains a trace's spans when its channel throws and retries on the next flush", () => {
    const owner = makeContext();
    owner.reportSpans.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    registerVercelRequestContextForTrace(TRACE_A, owner.ctx);

    const exporter = makeStreamingExporter();
    const result = vi.fn();
    exporter.export([createSpan("0000000000000001", TRACE_A)], result);
    expect(result).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });
    expect(owner.reportSpans).toHaveBeenCalledTimes(1);

    // Next flush retries the retained span together with the new one.
    exporter.export([createSpan("0000000000000002", TRACE_A)], vi.fn());
    expect(owner.reportSpans).toHaveBeenCalledTimes(2);
    expect(shippedSpanCount(owner.reportSpans, 1)).toBe(2);
  });
});

describe("VercelRuntimeSpanExporter (default accumulate mode)", () => {
  afterEach(() => {
    installAmbient(undefined);
    finalizeTrace(TRACE_A);
    finalizeTrace(TRACE_B);
    vi.restoreAllMocks();
  });

  it("accumulates a registered trace's spans and ships them once at finalizeTrace", () => {
    const owner = makeContext();
    const ambient = makeContext();
    registerVercelRequestContextForTrace(TRACE_A, owner.ctx);
    installAmbient(ambient.ctx);

    const exporter = new VercelRuntimeSpanExporter();
    exporter.export([createSpan("0000000000000001", TRACE_A)], vi.fn());
    exporter.export([createSpan("0000000000000002", TRACE_A)], vi.fn());
    // Nothing ships mid-run in accumulate mode.
    expect(owner.reportSpans).toHaveBeenCalledTimes(0);
    expect(ambient.reportSpans).toHaveBeenCalledTimes(0);

    finalizeTrace(TRACE_A);
    expect(owner.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanCount(owner.reportSpans)).toBe(2);
  });

  it("still ships untracked traces immediately via the ambient context", () => {
    const ambient = makeContext();
    installAmbient(ambient.ctx);

    const exporter = new VercelRuntimeSpanExporter();
    exporter.export([createSpan("0000000000000001", TRACE_B)], vi.fn());

    expect(ambient.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanCount(ambient.reportSpans)).toBe(1);
  });
});
