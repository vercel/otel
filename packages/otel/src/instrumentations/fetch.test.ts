import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { propagation } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { FetchInstrumentation } from "./fetch";
import type { FetchInstrumentationConfig } from "./fetch";

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
    // Mirrors code that patches `http` before instrumentation runs. It wraps
    // `request` and defines `get` as a call to the exported `request`.
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

describe("FetchInstrumentation context propagation", () => {
  const exporter = new InMemorySpanExporter();
  const sampledProvider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const unsampledProvider = new BasicTracerProvider({
    sampler: new AlwaysOffSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  let server: http.Server;
  let url: string;
  let received: (string | undefined)[];
  let instrumentation: FetchInstrumentation | undefined;

  beforeAll(async () => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    server = http.createServer((req, res) => {
      received.push(req.headers.traceparent as string | undefined);
      // No body, so the fetch span ends before `fetch` resolves.
      res.statusCode = 204;
      res.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    url = `http://127.0.0.1:${port}/api`;
  });

  afterAll(async () => {
    propagation.disable();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  beforeEach(() => {
    exporter.reset();
    received = [];
  });

  afterEach(() => {
    instrumentation?.disable();
    instrumentation = undefined;
  });

  function createInstrumentation(
    config: FetchInstrumentationConfig,
    sampled: boolean,
  ): FetchInstrumentation {
    instrumentation = new FetchInstrumentation({
      propagateContextUrls: [url],
      ...config,
    });
    instrumentation.setTracerProvider(
      sampled ? sampledProvider : unsampledProvider,
    );
    return instrumentation;
  }

  async function requestWithHttp(
    config: FetchInstrumentationConfig,
    sampled: boolean,
  ): Promise<string | undefined> {
    const httpModule = { ...http };
    createInstrumentation(config, sampled).instrumentHttp(httpModule, "http:");
    await new Promise<void>((resolve, reject) => {
      // Context is injected into `options.headers` only when it is set.
      httpModule
        .get(url, { headers: {} }, (res) => {
          res.resume();
          res.on("end", resolve);
        })
        .on("error", reject);
    });
    return received[0];
  }

  async function requestWithFetch(
    config: FetchInstrumentationConfig,
    sampled: boolean,
    init?: RequestInit,
  ): Promise<string | undefined> {
    createInstrumentation(config, sampled).instrumentFetch();
    const res = await fetch(url, init);
    await res.text();
    return received[0];
  }

  async function exportedSpanCount(): Promise<number> {
    await sampledProvider.forceFlush();
    await unsampledProvider.forceFlush();
    return exporter.getFinishedSpans().length;
  }

  describe.each([
    ["http", requestWithHttp],
    ["fetch", requestWithFetch],
  ])("%s", (_name, request) => {
    it("propagates a sampled traceparent", async () => {
      expect(await request({}, true)).toMatch(
        /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
      );
      expect(await exportedSpanCount()).toBe(1);
    });

    it("does not propagate an unsampled span by default", async () => {
      expect(await request({}, false)).toBeUndefined();
      expect(await exportedSpanCount()).toBe(0);
    });

    it("propagates an unsampled traceparent when enabled", async () => {
      const traceparent = await request(
        { propagateUnsampledContext: true },
        false,
      );
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
      expect(traceparent).not.toMatch(/^00-0{32}-|-0{16}-/);
      expect(await exportedSpanCount()).toBe(0);
    });

    it("respects dontPropagateContextUrls for unsampled spans", async () => {
      expect(
        await request(
          { propagateUnsampledContext: true, dontPropagateContextUrls: [url] },
          false,
        ),
      ).toBeUndefined();
    });

    it("respects propagateContextUrls for unsampled spans", async () => {
      expect(
        await request(
          {
            propagateUnsampledContext: true,
            propagateContextUrls: [/other\.example/],
          },
          false,
        ),
      ).toBeUndefined();
    });
  });

  describe("fetch per-call propagateContext", () => {
    it("does not propagate a sampled span when false", async () => {
      expect(
        await requestWithFetch({}, true, {
          opentelemetry: { propagateContext: false },
        }),
      ).toBeUndefined();
    });

    it("does not propagate an unsampled span when false", async () => {
      expect(
        await requestWithFetch({ propagateUnsampledContext: true }, false, {
          opentelemetry: { propagateContext: false },
        }),
      ).toBeUndefined();
    });

    it("propagates an unsampled span to an unlisted URL when true", async () => {
      expect(
        await requestWithFetch(
          { propagateUnsampledContext: true, propagateContextUrls: [] },
          false,
          { opentelemetry: { propagateContext: true } },
        ),
      ).toMatch(/-00$/);
    });
  });
});
