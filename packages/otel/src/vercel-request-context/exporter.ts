import { diag } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer/build/src/trace/json/trace";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import {
  getVercelRequestContext,
  getVercelRequestContextForTrace,
  hasVercelRequestContextForTrace,
  onTraceFinalize,
  type VercelRequestContext,
} from "./api";

/**
 * Upper bound on spans accumulated per trace while its invocation runs.
 * A long-running invocation (e.g. a Vercel Workflow) can produce thousands
 * of spans; when the cap is hit the oldest spans are dropped with a warning
 * rather than growing memory unboundedly.
 */
const MAX_TRACE_BUFFER_SIZE = 8192;

/**
 * Ships spans to the Vercel runtime's telemetry channel.
 *
 * The runtime only reliably persists ONE `reportSpans` payload per
 * invocation, and only when reported through that invocation's own request
 * context. So instead of shipping every batch as it is flushed (which loses
 * every mid-run batch of a long invocation, and mis-routes spans of
 * concurrent requests sharing the BatchSpanProcessor queue), this exporter:
 *
 * - ACCUMULATES spans whose trace has a captured owning context (see
 *   `registerVercelRequestContextForTrace`) into a per-trace buffer, and
 *   ships the whole buffer in a single report when the trace is finalized
 *   from its own request's `waitUntil` (see `finalizeTrace`).
 * - Ships spans of untracked traces immediately through the ambient request
 *   context, preserving the previous behavior for spans created outside any
 *   instrumented request.
 * - Retains spans it cannot attribute at all and re-attempts them on the
 *   next flush, instead of silently acking and dropping them.
 */
export class VercelRuntimeSpanExporter implements SpanExporter {
  private readonly traceBuffers = new Map<string, ReadableSpan[]>();
  private pendingSpans: ReadableSpan[] = [];
  private droppedSpansCount = 0;

  constructor() {
    onTraceFinalize((traceId) => this.shipTrace(traceId));
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    const immediate = new Map<VercelRequestContext, ReadableSpan[]>();
    const unattributable: ReadableSpan[] = [];

    // Previously-retained spans get another attribution attempt first.
    const candidates =
      this.pendingSpans.length > 0 ? [...this.pendingSpans, ...spans] : spans;
    this.pendingSpans = [];

    for (const span of candidates) {
      const traceId = span.spanContext().traceId;
      if (hasVercelRequestContextForTrace(traceId)) {
        this.bufferForTrace(traceId, span);
        continue;
      }
      const ambient = getVercelRequestContext();
      if (ambient?.telemetry) {
        const group = immediate.get(ambient);
        if (group) {
          group.push(span);
        } else {
          immediate.set(ambient, [span]);
        }
        continue;
      }
      unattributable.push(span);
    }

    if (unattributable.length > 0) {
      // No owning or ambient context (e.g. a bare-setTimeout timer flush for
      // an untracked trace). Retain and re-attempt on the next flush instead
      // of silently dropping.
      diag.debug(
        `@vercel/otel: no telemetry context for ${unattributable.length} span(s); retaining for the next flush`,
      );
      this.retain(unattributable);
    }

    try {
      immediate.forEach((contextSpans, context) => {
        try {
          reportSpans(context.telemetry, contextSpans);
        } catch (e) {
          this.retain(contextSpans);
          diag.warn("@vercel/otel: failed to report spans, retained:", e);
        }
      });
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
    } catch (e) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  }

  /**
   * Ship a trace's accumulated spans in a single report through the context
   * that owns the trace. Invoked via `finalizeTrace` from the owning
   * request's `waitUntil`, after the final flush drained the processor.
   */
  private shipTrace(traceId: string): void {
    const spans = this.traceBuffers.get(traceId);
    this.traceBuffers.delete(traceId);
    if (!spans || spans.length === 0) {
      return;
    }
    const context =
      getVercelRequestContextForTrace(traceId) ?? getVercelRequestContext();
    if (!context?.telemetry) {
      diag.warn(
        `@vercel/otel: no telemetry context to finalize trace ${traceId}; retaining ${spans.length} span(s)`,
      );
      this.retain(spans);
      return;
    }
    try {
      reportSpans(context.telemetry, spans);
    } catch (e) {
      this.retain(spans);
      diag.warn("@vercel/otel: failed to report finalized trace, retained:", e);
    }
  }

  private bufferForTrace(traceId: string, span: ReadableSpan): void {
    let buffer = this.traceBuffers.get(traceId);
    if (!buffer) {
      buffer = [];
      this.traceBuffers.set(traceId, buffer);
    }
    buffer.push(span);
    const overflow = buffer.length - MAX_TRACE_BUFFER_SIZE;
    if (overflow > 0) {
      buffer.splice(0, overflow);
      this.droppedSpansCount += overflow;
      diag.warn(
        `@vercel/otel: trace span buffer full, dropped ${this.droppedSpansCount} span(s) total`,
      );
    }
  }

  private retain(spans: ReadableSpan[]): void {
    this.pendingSpans.push(...spans);
    const overflow = this.pendingSpans.length - MAX_TRACE_BUFFER_SIZE;
    if (overflow > 0) {
      this.pendingSpans.splice(0, overflow);
      this.droppedSpansCount += overflow;
      diag.warn(
        `@vercel/otel: retained span buffer full, dropped ${this.droppedSpansCount} span(s) total`,
      );
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush?(): Promise<void> {
    return Promise.resolve();
  }
}

function reportSpans(
  telemetry: NonNullable<VercelRequestContext["telemetry"]> | undefined,
  spans: ReadableSpan[],
): void {
  if (!telemetry) {
    throw new Error("no telemetry channel");
  }
  const serializedData = JsonTraceSerializer.serializeRequest(spans);
  if (!serializedData) {
    throw new Error("Failed to serialize spans");
  }
  // Convert back to object format for the Vercel telemetry API
  const data = JSON.parse(
    new TextDecoder().decode(serializedData),
  ) as IExportTraceServiceRequest;
  telemetry.reportSpans(data);
}