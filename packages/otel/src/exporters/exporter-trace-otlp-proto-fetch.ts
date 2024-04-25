import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace";
import type { ExportResult } from "@opentelemetry/core";
import { OTLPExporterEdgeBase } from "./otlp-exporter-base";
import { getDefaultUrl } from "./trace-config";
import type { OTLPExporterConfig } from "./config";
import { encodeTraceServiceRequest } from "./proto";

/**
 * OTLP exporter for the `http/protobuf` protocol. Compatible with the "edge" runtime.
 */
export class OTLPHttpProtoTraceExporter implements SpanExporter {
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
    return createExportTraceServiceRequest(spans, undefined);
  }

  override toMessage(serviceRequest: IExportTraceServiceRequest): {
    body: string | Uint8Array | Blob;
    contentType: string;
    headers?: Record<string, string> | undefined;
  } {
    const body = encodeTraceServiceRequest(serviceRequest);
    return {
      body,
      contentType: "application/x-protobuf",
      headers: { accept: "application/x-protobuf" },
    };
  }

  getDefaultUrl(config: OTLPExporterConfig): string {
    return getDefaultUrl(config);
  }
}
