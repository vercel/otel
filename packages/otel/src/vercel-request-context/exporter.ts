import { diag } from "@opentelemetry/api";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer/build/src/trace/json/trace";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import { getVercelRequestContext } from "./api";

export class VercelRuntimeSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    const context = getVercelRequestContext();
    if (!context?.telemetry) {
      diag.warn("@vercel/otel: no telemetry context found");
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
      return;
    }

    try {
      const serializedData = JsonTraceSerializer.serializeRequest(spans);

      if (!serializedData) {
        throw new Error("Failed to serialize spans");
      }
      // Convert back to object format for the Vercel telemetry API
      const data = JSON.parse(
        new TextDecoder().decode(serializedData)
      ) as IExportTraceServiceRequest;

      context.telemetry.reportSpans(data);
      resultCallback({ code: ExportResultCode.SUCCESS, error: undefined });
    } catch (e) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush?(): Promise<void> {
    return Promise.resolve();
  }
}
