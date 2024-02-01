import type {
  OTLPExporterConfigBase,
  OTLPExporterError,
} from "@opentelemetry/otlp-exporter-base";
import { OTLPExporterBase } from "@opentelemetry/otlp-exporter-base/build/src/OTLPExporterBase";
import { diag } from "@opentelemetry/api";

export abstract class OTLPExporterEdgeBase<
  ExportItem,
  ServiceRequest,
> extends OTLPExporterBase<OTLPExporterConfigBase, ExportItem, ServiceRequest> {
  /** @internal */
  private _headers: Record<string, unknown> | undefined;

  constructor(config: OTLPExporterConfigBase = {}) {
    super(config);
    if (config.headers) {
      this._headers = config.headers;
    }
  }

  onShutdown(): void {
    diag.debug("@vercel/otel/otlp: onShutdown");
  }

  onInit(): void {
    diag.debug("@vercel/otel/otlp: onInit");
  }

  send(
    items: ExportItem[],
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug(
        "@vercel/otel/otlp: Shutdown already started. Cannot send objects"
      );
      return;
    }

    const serviceRequest = this.convert(items);

    let body: string | Uint8Array | Blob;
    let contentType: string;
    let headers: Record<string, string> | undefined;
    try {
      const message = this.toMessage(serviceRequest);
      ({ body, contentType, headers } = message);
    } catch (e) {
      diag.warn("@vercel/otel/otlp: no proto", e);
      return;
    }

    const promise = fetch(this.url, {
      method: "POST",
      body,
      headers: {
        ...this._headers,
        ...headers,
        "Content-Type": contentType,
        "User-Agent": "OTel-OTLP-Exporter-JavaScript/0.46.0",
      },
      // @ts-expect-error - this handles a Next.js specific issue
      next: { internal: true },
    })
      .then((res) => {
        diag.debug("@vercel/otel/otlp: onSuccess", res.status, res.statusText);
        onSuccess();
      })
      .catch((err) => {
        diag.error("@vercel/otel/otlp: onError", err);
        onError(err as OTLPExporterError);
      })
      .finally(() => {
        const index = this._sendingPromises.indexOf(promise);
        this._sendingPromises.splice(index, 1);
      });

    this._sendingPromises.push(promise);
  }

  getDefaultUrl(_config: OTLPExporterConfigBase): string {
    throw new Error("Method not implemented.");
  }

  abstract toMessage(serviceRequest: ServiceRequest): {
    body: string | Uint8Array | Blob;
    contentType: string;
    headers?: Record<string, string>;
  };
}
