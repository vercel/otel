import type * as http from "node:http";

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
    // Report the abort reason, like `fetch` does.
    const fail = (err: Error): void => {
      reject(signal.aborted ? (signal.reason as Error) : err);
    };
    const req = httpModule.request(
      url,
      { socketPath, method: "POST", headers, signal },
      (res) => {
        res.on("error", fail);
        res.on("end", () => resolve(res.statusCode ?? 0));
        res.resume();
      },
    );
    req.on("error", fail);
    req.end(body);
  });
}
