import * as http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPSocketProtoTraceExporter } from "./exporter-trace-otlp-proto-socket";

describe("OTLPSocketProtoTraceExporter", () => {
  it("sends spans as protobuf over the Unix socket", async () => {
    const socketPath = join(mkdtempSync(join(tmpdir(), "otel-")), "otlp.sock");
    const received: { url?: string; contentType?: string; size: number }[] = [];
    const server = http.createServer((req, res) => {
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
      });
      req.on("end", () => {
        received.push({
          url: req.url,
          contentType: req.headers["content-type"],
          size,
        });
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(socketPath, resolve);
    });

    try {
      const provider = new BasicTracerProvider({
        spanProcessors: [
          new SimpleSpanProcessor(new OTLPSocketProtoTraceExporter(socketPath)),
        ],
      });
      provider.getTracer("test").startSpan("work").end();
      await provider.forceFlush();

      expect(received).toEqual([
        {
          url: "/v1/traces",
          contentType: "application/x-protobuf",
          size: expect.any(Number) as number,
        },
      ]);
      expect(received[0]?.size).toBeGreaterThan(0);
    } finally {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });
});
