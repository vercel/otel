import { diag } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";
import type { OTLPExporterConfig } from "./config";

const DEFAULT_COLLECTOR_URL = "http://localhost:4318/v1/traces";

/** @internal */
export interface OtlpEncoding {
  readonly contentType: string;
  readonly headers?: Record<string, string>;
  serialize: (spans: ReadableSpan[]) => Uint8Array | undefined;
}

/** @internal */
export class OTLPFetchExporter {
  private readonly url: string;
  private readonly headers: Record<string, unknown> | undefined;
  private isShutdown = false;
  private readonly sending = new Set<Promise<void>>();

  constructor(
    config: OTLPExporterConfig,
    private readonly encoding: OtlpEncoding,
  ) {
    this.url = config.url || DEFAULT_COLLECTOR_URL;
    this.headers = config.headers;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this.isShutdown) {
      diag.debug(
        "@vercel/otel/otlp: Shutdown already started. Cannot send objects",
      );
      return;
    }

    const body = this.encoding.serialize(spans);
    if (!body) {
      resultCallback({
        code: 1,
        error: new Error("@vercel/otel/otlp: failed to serialize spans"),
      });
      return;
    }

    const promise = fetch(this.url, {
      method: "POST",
      body: body as BodyInit,
      headers: {
        ...this.headers,
        ...this.encoding.headers,
        "Content-Type": this.encoding.contentType,
        "User-Agent": "OTel-OTLP-Exporter-JavaScript/0.46.0",
      },
      // @ts-expect-error - this handles a Next.js specific issue
      next: { internal: true },
    })
      .then((res) => {
        diag.debug("@vercel/otel/otlp: onSuccess", res.status, res.statusText);
        resultCallback({ code: 0 });
        void res.arrayBuffer().catch(() => undefined);
      })
      .catch((err: unknown) => {
        diag.error("@vercel/otel/otlp: onError", err);
        resultCallback({
          code: 1,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      })
      .finally(() => {
        this.sending.delete(promise);
      });
    this.sending.add(promise);
  }

  async forceFlush(): Promise<void> {
    await Promise.all(this.sending);
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;
    await this.forceFlush();
  }
}
