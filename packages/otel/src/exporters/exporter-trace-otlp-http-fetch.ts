import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace";
import type { ExportResult } from "@opentelemetry/core";
import { OTLPExporterEdgeBase } from "./otlp-exporter-base";
import { getDefaultUrl } from "./trace-config";
import type { OTLPExporterConfig } from "./config";

/**
 * OTLP exporter for the `http/json` protocol. Compatible with the "edge" runtime.
 */
export class OTLPHttpJsonTraceExporter implements SpanExporter {
  /** @internal */
  private readonly impl: Impl;

  constructor(config: OTLPExporterConfig = {}) {
    this.impl = new Impl(config);
  }

  /** See `SpanExporter#export()` */
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.impl.export(spans, resultCallback);
  }

  /** See `SpanExporter#shutdown()` */
  shutdown(): Promise<void> {
    return this.impl.shutdown();
  }

  /** See `SpanExporter#forceFlush()` */
  forceFlush(): Promise<void> {
    return this.impl.forceFlush();
  }
}

/** @internal */
class Impl extends OTLPExporterEdgeBase<
  ReadableSpan,
  IExportTraceServiceRequest
> {
  convert(spans: ReadableSpan[]): IExportTraceServiceRequest {
    return createExportTraceServiceRequest(spans, {
      useHex: true,
      useLongBits: false,
    });
  }

  override toMessage(serviceRequest: IExportTraceServiceRequest): {
    body: string | Uint8Array | Blob;
    contentType: string;
    headers?: Record<string, string> | undefined;
  } {
    return {
      body: JSON.stringify(serviceRequest),
      contentType: "application/json",
    };
  }

  getDefaultUrl(config: OTLPExporterConfig): string {
    return getDefaultUrl(config);
  }
}
