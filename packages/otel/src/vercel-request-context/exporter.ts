import { diag } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  ExportResultCode,
  getNumberFromEnv,
  type ExportResult,
} from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer/build/src/trace/json/trace";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import { getVercelRequestContext, type VercelRequestContext } from "./api";
import { getRequestContext } from "./context-registry";

export class VercelRuntimeSpanExporter implements SpanExporter {
  private pendingSpans: ReadableSpan[] = [];
  private droppedSpansCount = 0;
  private readonly maxBufferSize =
    getNumberFromEnv("OTEL_BSP_MAX_QUEUE_SIZE") ?? 2048;

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    const ambient = getVercelRequestContext();

    if (!ambient?.telemetry) {
      // No ambient context (e.g. a bare-setTimeout timer flush). Reporting from
      // outside a request is unreliable even through a captured context (the
      // runtime may ack but never land the spans), so retain and let the next
      // in-context flush ship.
      diag.debug(
        "@vercel/otel: no telemetry context found; retaining spans for the next in-context flush",
      );
      this.retain(spans);
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
      return;
    }

    // Route each trace's spans through its owning request context (captured at
    // root onStart). Concurrent invocations on one instance share this exporter,
    // and the runtime drops spans reported through a foreign invocation's
    // channel. Failed groups are retained for the next flush, never lost.
    const batch =
      this.pendingSpans.length > 0 ? [...this.pendingSpans, ...spans] : spans;
    this.pendingSpans = [];
    const ambientTelemetry = ambient.telemetry;
    const remaining: ReadableSpan[] = [];
    groupByTraceId(batch).forEach((group, traceId) => {
      const telemetry =
        getRequestContext(traceId)?.telemetry ?? ambientTelemetry;
      try {
        reportSpans(telemetry, group);
      } catch (e) {
        diag.warn("@vercel/otel: reportSpans failed; retaining spans:", e);
        remaining.push(...group);
      }
    });
    if (remaining.length > 0) {
      this.retain(remaining);
    }
    resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
  }

  private retain(spans: ReadableSpan[]): void {
    this.pendingSpans.push(...spans);
    const overflow = this.pendingSpans.length - this.maxBufferSize;
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
  telemetry: NonNullable<VercelRequestContext["telemetry"]>,
  spans: ReadableSpan[],
): void {
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

function groupByTraceId(spans: ReadableSpan[]): Map<string, ReadableSpan[]> {
  const byTrace = new Map<string, ReadableSpan[]>();
  for (const span of spans) {
    const { traceId } = span.spanContext();
    const group = byTrace.get(traceId);
    if (group) {
      group.push(span);
    } else {
      byTrace.set(traceId, [span]);
    }
  }
  return byTrace;
}
