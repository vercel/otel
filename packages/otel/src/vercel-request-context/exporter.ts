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

export class VercelRuntimeSpanExporter implements SpanExporter {
  private pendingSpans: ReadableSpan[] = [];
  private droppedSpansCount = 0;
  private readonly maxBufferSize =
    getNumberFromEnv("OTEL_BSP_MAX_QUEUE_SIZE") ?? 2048;

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    const context = getVercelRequestContext();

    if (!context?.telemetry) {
      // No ambient context (e.g. a bare-setTimeout timer flush). Shipping via a
      // context captured earlier is unreliable (the runtime may ack but never
      // land the spans), so retain and let the next in-context flush re-ship.
      diag.debug(
        "@vercel/otel: no telemetry context found; retaining spans for the next in-context flush",
      );
      this.retain(spans);
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
      return;
    }

    // Ship previously-retained spans separately so a failing retained batch
    // neither fails the incoming batch nor gets lost.
    if (this.pendingSpans.length > 0) {
      const pending = this.pendingSpans;
      this.pendingSpans = [];
      try {
        reportSpans(context.telemetry, pending);
      } catch (e) {
        this.retain(pending);
        diag.warn("@vercel/otel: failed to re-ship retained spans:", e);
      }
    }

    try {
      reportSpans(context.telemetry, spans);
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
    } catch (e) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
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
