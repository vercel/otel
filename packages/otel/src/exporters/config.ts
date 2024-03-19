/**
 * OTLP exporter configuration.
 */
export interface OTLPExporterConfig {
  headers?: Record<string, unknown>;
  url?: string;
}
