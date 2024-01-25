import type { OTLPExporterConfigBase } from "@opentelemetry/otlp-exporter-base";

const DEFAULT_COLLECTOR_RESOURCE_PATH = "v1/traces";
const DEFAULT_COLLECTOR_URL = `http://localhost:4318/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;

/** @internal */
export function getDefaultUrl(config: OTLPExporterConfigBase): string {
  if (typeof config.url === "string") {
    return config.url;
  }
  return DEFAULT_COLLECTOR_URL;
}
