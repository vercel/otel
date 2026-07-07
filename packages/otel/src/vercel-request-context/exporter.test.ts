import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, hrTime } from "@opentelemetry/core";
import { diag, TraceFlags, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { VercelRequestContext } from "./api";
import { VercelRuntimeSpanExporter } from "./exporter";

const TRACE_ID = "ee75cd9e534ff5e9ed78b4a0c706f0f2";
const VRC_SYMBOL = Symbol.for("@vercel/request-context");

type GlobalWithReader = Record<symbol, unknown>;

function createSpan(spanId: string, traceId = TRACE_ID): ReadableSpan {
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

function installContext(ctx: VercelRequestContext | undefined): void {
  (globalThis as GlobalWithReader)[VRC_SYMBOL] = { get: () => ctx };
}

function countSpans(reportSpans: ReturnType<typeof vi.fn>, call = 0): number {
  const data = reportSpans.mock.calls[call]?.[0] as IExportTraceServiceRequest;
  return (data.resourceSpans ?? []).reduce(
    (total, rs) =>
      total +
      rs.scopeSpans.reduce((n, ss) => n + (ss.spans ?? []).length, 0),
    0,
  );
}

describe("VercelRuntimeSpanExporter", () => {
  afterEach(() => {
    installContext(undefined);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("retains spans when the context is missing and re-ships them on the next in-context flush", () => {
    const exporter = new VercelRuntimeSpanExporter();

    installContext(undefined);
    const firstResult = vi.fn();
    exporter.export([createSpan("0000000000000001")], firstResult);
    expect(firstResult).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });

    const { ctx, reportSpans } = makeContext();
    installContext(ctx);
    const secondResult = vi.fn();
    exporter.export([createSpan("0000000000000002")], secondResult);

    // Retained spans ship in their own batch, ahead of the incoming batch.
    expect(reportSpans).toHaveBeenCalledTimes(2);
    expect(countSpans(reportSpans, 0)).toBe(1);
    expect(countSpans(reportSpans, 1)).toBe(1);
  });

  it("drops oldest spans and warns once the retained buffer is full", () => {
    vi.stubEnv("OTEL_BSP_MAX_QUEUE_SIZE", "2");
    const warn = vi.spyOn(diag, "warn");
    const exporter = new VercelRuntimeSpanExporter();

    installContext(undefined);
    exporter.export(
      [
        createSpan("0000000000000001"),
        createSpan("0000000000000002"),
        createSpan("0000000000000003"),
      ],
      vi.fn(),
    );
    expect(warn).toHaveBeenCalled();

    const { ctx, reportSpans } = makeContext();
    installContext(ctx);
    exporter.export([], vi.fn());
    expect(countSpans(reportSpans)).toBe(2);
  });

  it("re-retains pending spans when re-shipping them fails, without failing the incoming batch", () => {
    const exporter = new VercelRuntimeSpanExporter();

    installContext(undefined);
    exporter.export([createSpan("0000000000000001")], vi.fn());

    const { ctx, reportSpans } = makeContext();
    reportSpans.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    installContext(ctx);
    const result = vi.fn();
    exporter.export([createSpan("0000000000000002")], result);

    expect(result).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });
    expect(reportSpans).toHaveBeenCalledTimes(2);
    expect(countSpans(reportSpans, 1)).toBe(1);

    // The failed pending span ships on the next flush.
    exporter.export([createSpan("0000000000000003")], vi.fn());
    expect(reportSpans).toHaveBeenCalledTimes(4);
    expect(countSpans(reportSpans, 2)).toBe(1);
    expect(countSpans(reportSpans, 3)).toBe(1);
  });
});
