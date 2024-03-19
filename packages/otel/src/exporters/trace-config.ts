import type { OTLPExporterConfig } from "./config";

const DEFAULT_COLLECTOR_RESOURCE_PATH = "v1/traces";
const DEFAULT_COLLECTOR_URL = `http://localhost:4318/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;

/** @internal */
export function getDefaultUrl(config: OTLPExporterConfig): string {
  if (typeof config.url === "string") {
    return config.url;
  }
  return DEFAULT_COLLECTOR_URL;
}
