import type * as http from "node:http";

/**
 * Sends a POST request over a Unix socket and resolves with the status code.
 * Retries a 429 after its `Retry-After` delay until `signal` aborts, and
 * rejects any other non-2xx status. Node.js only.
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
    // Report the abort reason, like `fetch` does.
    const fail = (err: Error): void => {
      reject(signal.aborted ? (signal.reason as Error) : err);
    };
    const retryLater = (seconds: number): void => {
      const onAbort = (): void => {
        clearTimeout(timer);
        fail(signal.reason as Error);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        send();
      }, seconds * 1000);
      signal.addEventListener("abort", onAbort, { once: true });
    };
    const send = (): void => {
      const req = httpModule.request(
        url,
        // A new connection per export, so a kept-alive connection that the
        // controller already closed is never reused.
        { socketPath, method: "POST", headers, signal, agent: false },
        (res) => {
          res.on("error", fail);
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status === 429 && !signal.aborted) {
              // The controller asks for a retry when too many exports run at once.
              retryLater(parseRetryAfter(res.headers["retry-after"]));
            } else if (status >= 200 && status < 300) {
              resolve(status);
            } else {
              fail(new Error(`OTLP export failed with status ${status}`));
            }
          });
          res.resume();
        },
      );
      req.on("error", fail);
      req.end(body);
    };
    send();
  });
}

/** Seconds to wait from a `Retry-After` header, defaulting to 1. */
function parseRetryAfter(value: string | undefined): number {
  const seconds = Number(value);
  return value && seconds >= 0 ? seconds : 1;
}
