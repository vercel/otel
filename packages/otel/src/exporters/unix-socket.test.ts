import * as http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { postToSocket } from "./unix-socket";

describe("postToSocket", () => {
  let server: http.Server | undefined;
  const socketPath = join(mkdtempSync(join(tmpdir(), "otel-")), "otlp.sock");

  afterEach(async () => {
    await new Promise((resolve) => {
      server?.close(resolve);
    });
    server = undefined;
  });

  /** Answers each request with the next status, repeating the last one. */
  async function listen(statuses: number[]): Promise<{ requests: number }> {
    const state = { requests: 0 };
    server = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        const status =
          statuses[Math.min(state.requests, statuses.length - 1)] ?? 200;
        state.requests++;
        res.writeHead(status, status === 429 ? { "Retry-After": "0" } : {});
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      server?.listen(socketPath, resolve);
    });
    return state;
  }

  function post(signal = new AbortController().signal): Promise<number> {
    return postToSocket(
      socketPath,
      "http://localhost/v1/traces",
      "body",
      {},
      signal,
    );
  }

  it("retries a 429 after Retry-After", async () => {
    const state = await listen([429, 429, 200]);

    await expect(post()).resolves.toBe(200);
    expect(state.requests).toBe(3);
  });

  it("rejects with the abort reason when 429s outlast the signal", async () => {
    await listen([429]);
    const controller = new AbortController();
    const reason = new Error("Export timed out after 50ms");
    setTimeout(() => controller.abort(reason), 50);

    await expect(post(controller.signal)).rejects.toBe(reason);
  });

  it("rejects other non-2xx statuses", async () => {
    const state = await listen([500]);

    await expect(post()).rejects.toThrow("OTLP export failed with status 500");
    expect(state.requests).toBe(1);
  });
});
