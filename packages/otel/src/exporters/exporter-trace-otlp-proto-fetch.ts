import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { OTLPExporterConfigBase } from "@opentelemetry/otlp-exporter-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace";
import { ServiceClientType } from "@opentelemetry/otlp-proto-exporter-base/build/src/platform/index";
import { getExportRequestProto } from "@opentelemetry/otlp-proto-exporter-base/build/src/platform/util";
import { OTLPExporterEdgeBase } from "./otlp-exporter-base";
import { getDefaultUrl } from "./trace-config";

export class OTLPHttpProtoTraceExporter extends OTLPExporterEdgeBase<
  ReadableSpan,
  IExportTraceServiceRequest
> {
  convert(spans: ReadableSpan[]): IExportTraceServiceRequest {
    return createExportTraceServiceRequest(spans, { useHex: true });
  }

  override toMessage(serviceRequest: IExportTraceServiceRequest): {
    body: string | Uint8Array | Blob;
    contentType: string;
    headers?: Record<string, string> | undefined;
  } {
    const serviceClientType = ServiceClientType.SPANS;
    const exportRequestType = getExportRequestProto(serviceClientType);
    const message = exportRequestType.create(serviceRequest);
    const body = exportRequestType.encode(message).finish();
    return {
      body,
      contentType: "application/x-protobuf",
      headers: { accept: "application/x-protobuf" },
    };
  }

  getDefaultUrl(config: OTLPExporterConfigBase): string {
    return getDefaultUrl(config);
  }
}
