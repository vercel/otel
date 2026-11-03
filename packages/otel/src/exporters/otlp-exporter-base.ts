import type { OTLPExporterError } from "@opentelemetry/otlp-exporter-base";
import { diag } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import { getStringFromEnv } from "../utils/env-parser";
import { toTimeoutMillis } from "../util/timeout";
import type { OTLPExporterConfig } from "./config";
import { postToSocket } from "./unix-socket";

const DEFAULT_TIMEOUT_MILLIS = 10_000;

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
  /** @internal */
  private readonly socketPath: string | undefined;
  /** @internal */
  private readonly timeoutMillis: number;

  constructor(config: OTLPExporterConfig = {}) {
    this.url = config.url || this.getDefaultUrl(config);
    this.socketPath = config.socketPath;
    this.timeoutMillis =
      toTimeoutMillis(config.timeoutMillis, "timeoutMillis") ??
      timeoutMillisFromEnv("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT") ??
      timeoutMillisFromEnv("OTEL_EXPORTER_OTLP_TIMEOUT") ??
      DEFAULT_TIMEOUT_MILLIS;
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
      onError(new Error("Exporter has been shut down") as OTLPExporterError);
      return;
    }

    let body: string | Uint8Array | Blob;
    let contentType: string;
    let headers: Record<string, string> | undefined;
    try {
      const message = this.toMessage(this.convert(items));
      ({ body, contentType, headers } = message);
    } catch (e) {
      diag.warn("@vercel/otel/otlp: failed to serialize spans", e);
      onError(
        (e instanceof Error ? e : new Error(String(e))) as OTLPExporterError,
      );
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(
        new Error(`Export timed out after ${this.timeoutMillis}ms`),
      );
    }, this.timeoutMillis);

    const requestHeaders = {
      ...(this._headers as Record<string, string> | undefined),
      ...headers,
      "Content-Type": contentType,
      "User-Agent": "OTel-OTLP-Exporter-JavaScript/0.46.0",
    };
    const request = this.socketPath
      ? postToSocket(
          this.socketPath,
          this.url,
          body as string | Uint8Array,
          requestHeaders,
          controller.signal,
        )
      : fetch(this.url, {
          method: "POST",
          body: body as BodyInit,
          headers: requestHeaders,
          signal: controller.signal,
          // @ts-expect-error - this handles a Next.js specific issue
          next: { internal: true },
        }).then((res) => {
          // Drain the response body.
          void res.arrayBuffer().catch(() => undefined);
          return res.status;
        });

    const promise = request
      .then((status) => {
        diag.debug("@vercel/otel/otlp: onSuccess", status);
        onSuccess();
      })
      .catch((err) => {
        diag.error("@vercel/otel/otlp: onError", err);
        onError(err as OTLPExporterError);
      })
      .finally(() => {
        clearTimeout(timer);
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

function timeoutMillisFromEnv(key: string): number | undefined {
  return toTimeoutMillis(getStringFromEnv(key), key);
}
