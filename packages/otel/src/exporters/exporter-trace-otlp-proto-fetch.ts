import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal";
import type { ExportResult } from "@opentelemetry/core";
import { encodeTraceServiceRequest } from "./proto";
import { OTLPExporterEdgeBase } from "./otlp-exporter-base";
import { getDefaultUrl } from "./trace-config";
import type { OTLPExporterConfig } from "./config";

export class OTLPHttpProtoTraceExporter implements SpanExporter {
  private readonly impl: Impl;

  constructor(config: OTLPExporterConfig = {}) {
    this.impl = new Impl(config);
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.impl.export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.impl.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.impl.forceFlush();
  }
}

class Impl extends OTLPExporterEdgeBase<
  ReadableSpan,
  IExportTraceServiceRequest
> {
  convert(spans: ReadableSpan[]): IExportTraceServiceRequest {
    return createExportTraceServiceRequest(spans);
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
