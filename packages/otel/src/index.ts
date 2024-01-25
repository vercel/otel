import type { Configuration } from "./types";
import { Sdk } from "./sdk";

export type * from "./types";
export { OTLPHttpJsonTraceExporter } from "./exporters/exporter-trace-otlp-http-fetch";
export { OTLPHttpProtoTraceExporter } from "./exporters/exporter-trace-otlp-proto-fetch";
export {
  type FetchInstrumentationConfig,
  FetchInstrumentation,
} from "./instrumentations/fetch";

export function registerOTel(
  optionsOrServiceName?: Configuration | string
): void {
  let options: Configuration;
  if (!optionsOrServiceName) {
    options = {};
  } else if (typeof optionsOrServiceName === "string") {
    options = { serviceName: optionsOrServiceName };
  } else {
    options = optionsOrServiceName;
  }
  const sdk = new Sdk(options);
  sdk.start();
}
