import * as http from "node:http";
import type { AddressInfo } from "node:net";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FetchInstrumentation } from "./fetch";

describe("FetchInstrumentation http", () => {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const instrumentation = new FetchInstrumentation();
  instrumentation.setTracerProvider(tracerProvider);

  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    url = `http://127.0.0.1:${port}/jwks`;
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  beforeEach(() => {
    exporter.reset();
  });

  async function getSpanNames(httpModule: typeof http): Promise<string[]> {
    await new Promise<void>((resolve, reject) => {
      httpModule
        .get(url, (res) => {
          res.resume();
          res.on("end", resolve);
        })
        .on("error", reject);
    });
    await tracerProvider.forceFlush();
    return exporter.getFinishedSpans().map((span) => span.name);
  }

  it("records one span for get", async () => {
    const httpModule = { ...http };
    instrumentation.instrumentHttp(httpModule, "http:");

    expect(await getSpanNames(httpModule)).toEqual([`http GET ${url}`]);
  });

  it("records one span when get calls the exported request", async () => {
    // Mirrors the Vercel runtime, which wraps `request` and defines `get` as a
    // call to the exported `request`.
    const httpModule = { ...http };
    const nativeRequest = httpModule.request;
    let requests = 0;
    httpModule.request = ((...args: Parameters<typeof http.request>) => {
      requests += 1;
      return nativeRequest(...args);
    }) as typeof http.request;
    httpModule.get = ((...args: Parameters<typeof http.request>) =>
      httpModule.request(...args).end()) as typeof http.get;
    instrumentation.instrumentHttp(httpModule, "http:");

    expect(await getSpanNames(httpModule)).toEqual([`http GET ${url}`]);
    expect(requests).toBe(1);
  });
});
