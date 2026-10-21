import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace";
import type { ExportResult } from "@opentelemetry/core";
import { ProtobufTraceSerializer } from "@opentelemetry/otlp-transformer";
import { OTLPFetchExporter } from "./otlp-exporter-base";
import type { OTLPExporterConfig } from "./config";

/**
 * OTLP exporter for the `http/protobuf` protocol. Compatible with the "edge" runtime.
 */
export class OTLPHttpProtoTraceExporter implements SpanExporter {
  /** @internal */
  private readonly impl: OTLPFetchExporter;

  constructor(config: OTLPExporterConfig = {}) {
    this.impl = new OTLPFetchExporter(config, {
      contentType: "application/x-protobuf",
      headers: { accept: "application/x-protobuf" },
      serialize: (spans: ReadableSpan[]): Uint8Array | undefined =>
        ProtobufTraceSerializer.serializeRequest(spans),
    });
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
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
