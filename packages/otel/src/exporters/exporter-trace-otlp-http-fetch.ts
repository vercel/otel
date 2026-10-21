import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace";
import type { ExportResult } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import { OTLPFetchExporter } from "./otlp-exporter-base";
import type { OTLPExporterConfig } from "./config";

/**
 * OTLP exporter for the `http/json` protocol. Compatible with the "edge" runtime.
 */
export class OTLPHttpJsonTraceExporter implements SpanExporter {
  /** @internal */
  private readonly impl: OTLPFetchExporter;

  constructor(config: OTLPExporterConfig = {}) {
    this.impl = new OTLPFetchExporter(config, {
      contentType: "application/json",
      serialize: (spans: ReadableSpan[]): Uint8Array | undefined =>
        JsonTraceSerializer.serializeRequest(spans),
    });
  }

  /** See `SpanExporter#export()` */
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
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
