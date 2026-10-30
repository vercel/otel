/**
 * OTLP exporter configuration.
 */
export interface OTLPExporterConfig {
  headers?: Record<string, unknown>;
  url?: string;
  /**
   * Maximum time in milliseconds to wait for an export request before aborting it.
   * Defaults to `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT`, then `OTEL_EXPORTER_OTLP_TIMEOUT`, then 10000.
   * Values that are not positive finite numbers are ignored in favor of the next source.
   */
  timeoutMillis?: number;
}
