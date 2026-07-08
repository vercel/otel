import { diag } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer/build/src/trace/json/trace";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import {
  getVercelRequestContext,
  getVercelRequestContextForTrace,
  onTraceFinalize,
  type VercelRequestContext,
} from "./api";

/**
 * Upper bound on spans buffered per trace while no telemetry channel is
 * available to ship them. When the cap is hit the oldest spans are dropped
 * with a warning rather than growing memory unboundedly.
 */
const MAX_TRACE_BUFFER_SIZE = 8192;

/**
 * Ships spans to the Vercel runtime's telemetry channel.
 *
 * The runtime attributes a `reportSpans` payload from its content, and only
 * payloads composed of a SINGLE trace that belongs to a currently-active
 * request are reliably persisted end to end. Mixed-trace payloads (the OTel
 * BatchSpanProcessor queue is shared by every concurrent request on the
 * instance, so its flushes ship whatever is queued) used to be dropped whole
 * or misfiled depending on which span happened to sit first in the batch.
 *
 * So this exporter enforces strict per-trace payload discipline, streaming
 * spans out as they are flushed:
 *
 * - Every incoming span is grouped by ITS OWN trace id, and each trace's
 *   spans ship as their own single-trace payload. Traces are never mixed
 *   into one payload, so one stale span can no longer poison other traces'
 *   delivery.
 * - Spans ship EAGERLY on every flush, through the telemetry channel of the
 *   context captured for their trace (see
 *   `registerVercelRequestContextForTrace`), falling back to the ambient
 *   context for untracked traces. This bounds client memory on long
 *   invocations and gets spans out of the process while the run is still
 *   executing.
 * - Spans with no reachable telemetry channel are buffered per trace
 *   (bounded) and retried on the next flush; the trace's final flush
 *   (`finalizeTrace`, from the owning request's `waitUntil`) ships whatever
 *   is left instead of silently dropping it.
 */
export class VercelRuntimeSpanExporter implements SpanExporter {
  private readonly traceBuffers = new Map<string, ReadableSpan[]>();
  private droppedSpansCount = 0;
  /**
   * Opt-in streaming mode (`VERCEL_OTEL_STREAM_SPANS=1`): ship every trace's
   * spans on every flush instead of accumulating until the trace's final
   * flush. NOTE: today the platform drops full-size trace chunks that the
   * runtime forwards mid-response, so streamed spans of long traces are
   * lost past the runtime's chunk threshold; keep this OFF until that is
   * fixed. Default (off) accumulates per trace and ships once at
   * `finalizeTrace`, which is reliable end to end.
   */
  private readonly streamSpans =
    process.env.VERCEL_OTEL_STREAM_SPANS === "1";

  constructor() {
    onTraceFinalize((traceId) => this.shipTrace(traceId));
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    // Group incoming spans per trace (strict: traces never share a payload).
    for (const span of spans) {
      this.bufferForTrace(span.spanContext().traceId, span);
    }

    try {
      for (const traceId of Array.from(this.traceBuffers.keys())) {
        if (this.streamSpans || !getVercelRequestContextForTrace(traceId)) {
          // Streaming mode ships everything on every flush. Accumulate mode
          // (default) keeps registered traces buffered until their
          // finalizeTrace, and only ships untracked traces (no owning
          // request captured, e.g. spans created outside an instrumented
          // request) now via the ambient context.
          this.shipTrace(traceId);
        }
      }
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
    } catch (e) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  }

  /**
   * Ship a trace's buffered spans as a single-trace payload through the
   * telemetry channel of the context that owns the trace (captured at root
   * span start), falling back to the ambient context. Leaves the spans
   * buffered when no channel is reachable (they retry on the next flush and
   * at `finalizeTrace`).
   */
  private shipTrace(traceId: string): void {
    const spans = this.traceBuffers.get(traceId);
    if (!spans || spans.length === 0) {
      this.traceBuffers.delete(traceId);
      return;
    }
    const context =
      getVercelRequestContextForTrace(traceId) ?? getVercelRequestContext();
    if (!context?.telemetry) {
      // No reachable channel right now (e.g. a bare-setTimeout timer flush
      // for an untracked trace). Keep the spans buffered for a later flush
      // instead of silently dropping them.
      diag.debug(
        `@vercel/otel: no telemetry context for trace ${traceId}; keeping ${spans.length} span(s) buffered`,
      );
      return;
    }
    this.traceBuffers.delete(traceId);
    try {
      reportSpans(context.telemetry, spans);
    } catch (e) {
      // Put them back so the next flush or the trace's finalize retries.
      this.retainForTrace(traceId, spans);
      diag.warn("@vercel/otel: failed to report spans, retained:", e);
    }
  }

  private bufferForTrace(traceId: string, span: ReadableSpan): void {
    let buffer = this.traceBuffers.get(traceId);
    if (!buffer) {
      buffer = [];
      this.traceBuffers.set(traceId, buffer);
    }
    buffer.push(span);
    this.enforceCap(buffer);
  }

  private retainForTrace(traceId: string, spans: ReadableSpan[]): void {
    const buffer = this.traceBuffers.get(traceId);
    if (buffer) {
      // Newer spans may have been buffered while we were shipping; keep
      // start-order by prepending the failed batch.
      buffer.unshift(...spans);
      this.enforceCap(buffer);
    } else {
      this.traceBuffers.set(traceId, spans);
      this.enforceCap(spans);
    }
  }

  private enforceCap(buffer: ReadableSpan[]): void {
    const overflow = buffer.length - MAX_TRACE_BUFFER_SIZE;
    if (overflow > 0) {
      buffer.splice(0, overflow);
      this.droppedSpansCount += overflow;
      diag.warn(
        `@vercel/otel: trace span buffer full, dropped ${this.droppedSpansCount} span(s) total`,
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
