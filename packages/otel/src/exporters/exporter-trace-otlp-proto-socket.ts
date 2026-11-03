import type * as fs from "node:fs";
import type * as http from "node:http";
import { context } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import { suppressTracing } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { Impl } from "./exporter-trace-otlp-proto-fetch";

/** The OTLP socket of the controller in a Vercel Daemon. */
export const DAEMON_OTLP_SOCKET_PATH = "/var/run/vercel/o11y/otlp.sock";

/** Returns true when `path` is a Unix socket. Always false outside Node.js. */
export function isSocket(path: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fsModule = require("node:fs") as typeof fs;
    return fsModule.statSync(path).isSocket();
  } catch {
    return false;
  }
}

/**
 * OTLP exporter for the `http/protobuf` protocol over a Unix socket. Node.js only.
 * @internal
 */
export class OTLPSocketProtoTraceExporter implements SpanExporter {
  private readonly impl: SocketImpl;

  constructor(socketPath: string) {
    this.impl = new SocketImpl(socketPath);
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.impl.export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.impl.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.impl.forceFlush();
  }
}

class SocketImpl extends Impl {
  constructor(private readonly socketPath: string) {
    super({ url: "http://localhost/v1/traces" });
  }

  protected override post(
    body: string | Uint8Array | Blob,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<number> {
    let httpModule: typeof http;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      httpModule = require("node:http") as typeof http;
    } catch (err) {
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      // Do not trace the export request itself.
      context.with(suppressTracing(context.active()), () => {
        const req = httpModule.request(
          this.url,
          { socketPath: this.socketPath, method: "POST", headers, signal },
          (res) => {
            res.on("error", reject);
            res.on("end", () => resolve(res.statusCode ?? 0));
            res.resume();
          },
        );
        req.on("error", reject);
        req.end(body as string | Uint8Array);
      });
    });
  }
}
