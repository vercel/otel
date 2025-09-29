import type { OTLPExporterError } from "@opentelemetry/otlp-exporter-base";
import { diag } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { OTLPExporterConfig } from "./config";

/** @internal */
export abstract class OTLPExporterEdgeBase<ExportItem, ServiceRequest> {
  /** @internal */
  private _headers: Record<string, unknown> | undefined;
  /** @internal */
  private _shutdownOnce = { isCalled: false };
  /** @internal */
  private _sendingPromises: Promise<void>[] = [];
  /** @internal */
  protected url: string;

  constructor(config: OTLPExporterConfig = {}) {
    this.url = config.url || this.getDefaultUrl(config);
    if (config.headers) {
      this._headers = config.headers;
    }
    this.onInit();
  }

  onShutdown(): void {
    diag.debug("@vercel/otel/otlp: onShutdown");
  }

  onInit(): void {
    diag.debug("@vercel/otel/otlp: onInit");
  }

  export(
    items: ExportItem[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug(
        "@vercel/otel/otlp: Shutdown already started. Cannot send objects",
      );
      return;
    }

    this.send(
      items,
      () => resultCallback({ code: 0 }), // SUCCESS
      (error: OTLPExporterError) => resultCallback({ code: 1, error }), // FAILED
    );
  }

  async forceFlush(): Promise<void> {
    await Promise.all(this._sendingPromises);
  }

  async shutdown(): Promise<void> {
    this._shutdownOnce.isCalled = true;
    this.onShutdown();
    await this.forceFlush();
  }

  send(
    items: ExportItem[],
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void,
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug(
        "@vercel/otel/otlp: Shutdown already started. Cannot send objects",
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
      body: body as BodyInit,
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
        // Drain the response body.
        void res.arrayBuffer().catch(() => undefined);
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

  abstract convert(items: ExportItem[]): ServiceRequest;
  abstract getDefaultUrl(config: OTLPExporterConfig): string;
  abstract toMessage(serviceRequest: ServiceRequest): {
    body: string | Uint8Array | Blob;
    contentType: string;
    headers?: Record<string, string>;
  };
}
