import "performance-polyfill";
import {
  BasicTracerProvider,
  ReadableSpan,
  SDKRegistrationConfig,
  SimpleSpanProcessor,
  TracerConfig,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {
  OTLPExporterBase,
  OTLPExporterError,
  OTLPExporterConfigBase,
} from "@opentelemetry/otlp-exporter-base";
import { diag } from "@opentelemetry/api";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { getEnv } from "@opentelemetry/core";

const DEFAULT_COLLECTOR_RESOURCE_PATH = "v1/traces";
const DEFAULT_COLLECTOR_URL = `http://localhost:4318/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;

class EdgeTraceProvider extends BasicTracerProvider {
  constructor(config: TracerConfig = {}) {
    super(config);
  }

  register(config: SDKRegistrationConfig = {}) {
    if (config.contextManager === undefined) {
      config.contextManager = new AsyncLocalStorageContextManager();
      config.contextManager.enable();
    }

    super.register(config);
  }
}

abstract class OTLPExporterEdgeBase<
  ExportItem,
  ServiceRequest
> extends OTLPExporterBase<OTLPExporterConfigBase, ExportItem, ServiceRequest> {
  onShutdown() {}
  onInit(_config: OTLPExporterConfigBase) {}
  send(
    items: ExportItem[],
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug("Shutdown already started. Cannot send objects");
      return;
    }
    const serviceRequest = this.convert(items);

    const promise = fetch(this.url, {
      method: "POST",
      body: JSON.stringify(serviceRequest),
      headers: {
        "Content-Type": "application/json",
      },
      // @ts-ignore
      next: {
        internal: true,
      },
    }).then(onSuccess, onError);

    this._sendingPromises.push(promise);
    const popPromise = () => {
      const index = this._sendingPromises.indexOf(promise);
      this._sendingPromises.splice(index, 1);
    };
    promise.finally(popPromise);
  }
}

class OTLPTraceExporter extends OTLPExporterEdgeBase<
  ReadableSpan,
  IExportTraceServiceRequest
> {
  convert(spans: ReadableSpan[]): IExportTraceServiceRequest {
    return createExportTraceServiceRequest(spans, true);
  }
  getDefaultUrl(config: OTLPExporterConfigBase) {
    return typeof config.url === "string"
      ? config.url
      : getEnv().OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.length > 0
      ? getEnv().OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
      : DEFAULT_COLLECTOR_URL;
  }
}

export const registerOTel = (serviceName: string) => {
  const provider = new EdgeTraceProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
  });
  // For now, we'll support the simple span processor.
  // In the future, we want to change this to a batch span processor that
  // takes advantage of the `waitUntil` API to ensure that the batch is sent
  // and does not interfere with the page lifecycle.
  provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
  provider.register();
};
