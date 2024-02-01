import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { OTLPExporterConfigBase } from "@opentelemetry/otlp-exporter-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace";
import { OTLPExporterEdgeBase } from "./otlp-exporter-base";
import { getDefaultUrl } from "./trace-config";

export class OTLPHttpJsonTraceExporter extends OTLPExporterEdgeBase<
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

  getDefaultUrl(config: OTLPExporterConfigBase): string {
    return getDefaultUrl(config);
  }
}
