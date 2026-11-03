import type * as fs from "node:fs";
import type * as http from "node:http";
import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";

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
 * Sends a POST request over a Unix socket and resolves with the status code.
 * Node.js only.
 */
export function postToSocket(
  socketPath: string,
  url: string,
  body: string | Uint8Array,
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
        url,
        { socketPath, method: "POST", headers, signal },
        (res) => {
          res.on("error", reject);
          res.on("end", () => resolve(res.statusCode ?? 0));
          res.resume();
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  });
}
