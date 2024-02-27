import { expect, it } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { describe } from "../../lib/with-bridge";
import { expectTrace } from "../../lib/expect-trace";

describe("vercel deployment: outbound", {}, (props) => {
  it("should create a span for fetch", async () => {
    const { collector, bridge } = props();

    await bridge.fetch(
      `/slugs/baz?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port}`
      )}`
    );

    await expectTrace(collector, {
      name: "GET /slugs/[slug]",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: { "vercel.runtime": "nodejs" },
      spans: [
        {
          name: "render route (app) /slugs/[slug]",
          spans: [
            {
              name: "sample-span",
              attributes: { scope: "sample", foo: "bar" },
              spans: [
                {
                  name: `fetch POST http://localhost:${bridge.port}/`,
                  kind: SpanKind.CLIENT,
                  attributes: {
                    scope: "@vercel/otel/fetch",
                    "http.method": "POST",
                    "http.url": `http://localhost:${bridge.port}/`,
                    "http.host": `localhost:${bridge.port}`,
                    "http.scheme": "http",
                    "net.peer.name": "localhost",
                    "net.peer.port": `${bridge.port}`,
                    "http.status_code": 200,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_content_length_uncompressed":
                      expect.any(Number),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_time": expect.any(Number),
                    "operation.name": "fetch.POST",
                    "resource.name": `http://localhost:${bridge.port}/`,
                    custom1: "value1",
                  },
                  spans: [],
                },
                { name: "process-response" },
              ],
            },
          ],
        },
      ],
    });

    const fetches = bridge.fetches;
    expect(fetches).toHaveLength(1);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fetch = fetches[0]!;
    expect(fetch.headers.get("traceparent")).toMatch(
      /00-[0-9a-fA-F]{32}-[0-9a-fA-F]{16}-01/
    );
  });

  it("should create a span for fetch in edge", async () => {
    const { collector, bridge } = props();

    await bridge.fetch(
      `/slugs/baz/edge?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port}`
      )}`
    );

    await expectTrace(collector, {
      name: "GET /slugs/[slug]/edge",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: { "vercel.runtime": "edge" },
      spans: [
        {
          name: "render route (app) /slugs/[slug]/edge",
          spans: [
            {
              name: "sample-span",
              attributes: { scope: "sample", foo: "bar" },
              spans: [
                {
                  name: `fetch POST http://localhost:${bridge.port}/`,
                  kind: SpanKind.CLIENT,
                  attributes: {
                    scope: "@vercel/otel/fetch",
                    "http.method": "POST",
                    "http.url": `http://localhost:${bridge.port}/`,
                    "http.host": `localhost:${bridge.port}`,
                    "http.scheme": "http",
                    "net.peer.name": "localhost",
                    "net.peer.port": `${bridge.port}`,
                    "http.status_code": 200,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_content_length_uncompressed":
                      expect.any(Number),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_time": expect.any(Number),
                    "operation.name": "fetch.POST",
                    "resource.name": `http://localhost:${bridge.port}/`,
                    custom1: "value1",
                  },
                  spans: [],
                },
                { name: "process-response" },
              ],
            },
          ],
        },
      ],
    });

    const fetches = bridge.fetches;
    expect(fetches).toHaveLength(1);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fetch = fetches[0]!;
    expect(fetch.headers.get("traceparent")).toMatch(
      /00-[0-9a-fA-F]{32}-[0-9a-fA-F]{16}-01/
    );
  });

  it("should not propagate context to an unconfigured origin", async () => {
    const { collector, bridge } = props();

    await bridge.fetch(
      `/slugs/baz?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port}?no-propagation=1`
      )}`
    );

    await expectTrace(collector, {
      name: "GET /slugs/[slug]",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: { "vercel.runtime": "nodejs" },
      spans: [
        {
          name: "render route (app) /slugs/[slug]",
          attributes: {},
          spans: [
            {
              name: "sample-span",
              attributes: { scope: "sample", foo: "bar" },
              spans: [
                {
                  name: `fetch POST http://localhost:${bridge.port}/?no-propagation=1`,
                  kind: SpanKind.CLIENT,
                  attributes: {
                    scope: "@vercel/otel/fetch",
                    "http.method": "POST",
                    "http.url": `http://localhost:${bridge.port}/?no-propagation=1`,
                    "http.host": `localhost:${bridge.port}`,
                    "http.scheme": "http",
                    "net.peer.name": "localhost",
                    "net.peer.port": `${bridge.port}`,
                    "http.status_code": 200,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_content_length_uncompressed":
                      expect.any(Number),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_time": expect.any(Number),
                  },
                },
                { name: "process-response" },
              ],
            },
          ],
        },
      ],
    });

    const fetches = bridge.fetches;
    expect(fetches).toHaveLength(1);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fetch = fetches[0]!;
    expect(fetch.headers.get("traceparent")).toBe(null);
  });

  it("should record a failing fetch", async () => {
    const { collector, bridge } = props();

    await bridge.fetch(
      `/slugs/baz?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port + 1}`
      )}`
    );

    await expectTrace(collector, {
      name: "GET /slugs/[slug]",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: { "vercel.runtime": "nodejs" },
      spans: [
        {
          name: "render route (app) /slugs/[slug]",
          attributes: {},
          spans: [
            {
              name: "sample-span",
              status: { code: SpanStatusCode.ERROR },
              attributes: { scope: "sample", foo: "bar" },
              spans: [
                {
                  name: `fetch POST http://localhost:${bridge.port + 1}/`,
                  status: { code: SpanStatusCode.ERROR },
                  attributes: {
                    scope: "@vercel/otel/fetch",
                    "http.method": "POST",
                    "http.url": `http://localhost:${bridge.port + 1}/`,
                    "http.host": `localhost:${bridge.port + 1}`,
                    "http.scheme": "http",
                    "net.peer.name": "localhost",
                    "net.peer.port": `${bridge.port + 1}`,
                  },
                  events: [
                    {
                      name: "exception",
                      attributes: {
                        "exception.type": "TypeError",
                        "exception.message": "fetch failed",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("should record a fetch with failing status", async () => {
    const { collector, bridge } = props();

    await bridge.fetch(
      `/slugs/baz?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port}`
      )}&status=500`
    );

    await expectTrace(collector, {
      name: "GET /slugs/[slug]",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: { "vercel.runtime": "nodejs" },
      spans: [
        {
          name: "render route (app) /slugs/[slug]",
          attributes: {},
          spans: [
            {
              name: "sample-span",
              attributes: { scope: "sample", foo: "bar" },
              spans: [
                {
                  name: `fetch POST http://localhost:${bridge.port}/`,
                  status: { code: SpanStatusCode.ERROR },
                  attributes: {
                    scope: "@vercel/otel/fetch",
                    "http.method": "POST",
                    "http.url": `http://localhost:${bridge.port}/`,
                    "http.host": `localhost:${bridge.port}`,
                    "http.scheme": "http",
                    "net.peer.name": "localhost",
                    "net.peer.port": `${bridge.port}`,
                    "http.status_code": 500,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_content_length_uncompressed":
                      expect.any(Number),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    "http.response_time": expect.any(Number),
                  },
                  events: [],
                },
                { name: "process-response" },
              ],
            },
          ],
        },
      ],
    });
  });
});

describe(
  "vercel deployment: outbound with resourceNameTemplate",
  {
    env: {
      TEST_FETCH_RESOURCE_NAME_TEMPLATE: "custom {http.scheme} {http.host}",
    },
  },
  (props) => {
    it("should create a span for fetch", async () => {
      const { collector, bridge } = props();

      await bridge.fetch(
        `/slugs/baz?dataUrl=${encodeURIComponent(
          `http://localhost:${bridge.port}`
        )}`
      );

      await expectTrace(collector, {
        name: "GET /slugs/[slug]",
        status: { code: SpanStatusCode.UNSET },
        kind: SpanKind.SERVER,
        resource: { "vercel.runtime": "nodejs" },
        spans: [
          {
            name: "render route (app) /slugs/[slug]",
            attributes: {},
            spans: [
              {
                name: "sample-span",
                attributes: { scope: "sample", foo: "bar" },
                spans: [
                  {
                    name: `fetch POST http://localhost:${bridge.port}/`,
                    kind: SpanKind.CLIENT,
                    attributes: {
                      scope: "@vercel/otel/fetch",
                      "http.method": "POST",
                      "http.url": `http://localhost:${bridge.port}/`,
                      "http.host": `localhost:${bridge.port}`,
                      "http.scheme": "http",
                      "net.peer.name": "localhost",
                      "net.peer.port": `${bridge.port}`,
                      "http.status_code": 200,
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                      "http.response_content_length_uncompressed":
                        expect.any(Number),
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                      "http.response_time": expect.any(Number),
                      "operation.name": "fetch.POST",
                      "resource.name": `custom http localhost:${bridge.port}`,
                    },
                    spans: [],
                  },
                  { name: "process-response" },
                ],
              },
            ],
          },
        ],
      });

      const fetches = bridge.fetches;
      expect(fetches).toHaveLength(1);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const fetch = fetches[0]!;
      expect(fetch.headers.get("traceparent")).toMatch(
        /00-[0-9a-fA-F]{32}-[0-9a-fA-F]{16}-01/
      );
    });
  }
);
