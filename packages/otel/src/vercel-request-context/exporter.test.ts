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

function shippedSpanIds(
  reportSpans: ReturnType<typeof vi.fn>,
  call = 0,
): string[] {
  const data = reportSpans.mock.calls[call]?.[0] as IExportTraceServiceRequest;
  return (data.resourceSpans ?? []).flatMap((rs) =>
    rs.scopeSpans.flatMap((ss) =>
      (ss.spans ?? []).map((s) => String(s.spanId)),
    ),
  );
}

describe("VercelRuntimeSpanExporter", () => {
  afterEach(() => {
    installAmbient(undefined);
    // Clear any registrations left behind by a test.
    finalizeTrace(TRACE_A);
    finalizeTrace(TRACE_B);
    vi.restoreAllMocks();
  });

  it("accumulates spans of a registered trace and ships them once, through the owning context, at finalizeTrace", () => {
    const owner = makeContext();
    const ambient = makeContext();
    registerVercelRequestContextForTrace(TRACE_A, owner.ctx);
    installAmbient(ambient.ctx);

    const exporter = new VercelRuntimeSpanExporter();
    const result = vi.fn();
    // Two mid-run flushes: nothing must be reported yet.
    exporter.export([createSpan("0000000000000001", TRACE_A)], result);
    exporter.export([createSpan("0000000000000002", TRACE_A)], result);
    expect(result).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });
    expect(owner.reportSpans).toHaveBeenCalledTimes(0);
    expect(ambient.reportSpans).toHaveBeenCalledTimes(0);

    // Finalize: exactly ONE report, through the owner, with all spans.
    finalizeTrace(TRACE_A);
    expect(owner.reportSpans).toHaveBeenCalledTimes(1);
    expect(ambient.reportSpans).toHaveBeenCalledTimes(0);
    expect(shippedSpanIds(owner.reportSpans)).toHaveLength(2);

    // Finalizing again reports nothing further.
    finalizeTrace(TRACE_A);
    expect(owner.reportSpans).toHaveBeenCalledTimes(1);
  });

  it("keeps concurrent traces separate: each finalize ships only its own spans", () => {
    const ownerA = makeContext();
    const ownerB = makeContext();
    registerVercelRequestContextForTrace(TRACE_A, ownerA.ctx);
    registerVercelRequestContextForTrace(TRACE_B, ownerB.ctx);

    const exporter = new VercelRuntimeSpanExporter();
    exporter.export(
      [
        createSpan("0000000000000001", TRACE_A),
        createSpan("0000000000000002", TRACE_B),
        createSpan("0000000000000003", TRACE_A),
      ],
      vi.fn(),
    );

    finalizeTrace(TRACE_A);
    expect(ownerA.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanIds(ownerA.reportSpans)).toHaveLength(2);
    expect(ownerB.reportSpans).toHaveBeenCalledTimes(0);

    finalizeTrace(TRACE_B);
    expect(ownerB.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanIds(ownerB.reportSpans)).toHaveLength(1);
  });

  it("ships spans of untracked traces immediately through the ambient context", () => {
    const ambient = makeContext();
    installAmbient(ambient.ctx);

    const exporter = new VercelRuntimeSpanExporter();
    exporter.export([createSpan("0000000000000001", TRACE_B)], vi.fn());

    expect(ambient.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanIds(ambient.reportSpans)).toHaveLength(1);
  });

  it("retains unattributable spans and re-attempts them on a later flush", () => {
    const exporter = new VercelRuntimeSpanExporter();

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

    // Retained + incoming ship together via the now-available ambient context.
    expect(reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanIds(reportSpans)).toHaveLength(2);
  });

  it("retains a finalized trace's spans when its context fails, without losing them", () => {
    const failing = makeContext();
    failing.reportSpans.mockImplementation(() => {
      throw new Error("boom");
    });
    registerVercelRequestContextForTrace(TRACE_A, failing.ctx);
    installAmbient(undefined);

    const exporter = new VercelRuntimeSpanExporter();
    exporter.export([createSpan("0000000000000001", TRACE_A)], vi.fn());
    finalizeTrace(TRACE_A);
    expect(failing.reportSpans).toHaveBeenCalledTimes(1);

    // The retained spans ship on the next flush that has a working context.
    const healthy = makeContext();
    installAmbient(healthy.ctx);
    exporter.export([], vi.fn());
    expect(healthy.reportSpans).toHaveBeenCalledTimes(1);
    expect(shippedSpanIds(healthy.reportSpans)).toHaveLength(1);
  });
});