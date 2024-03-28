import { expect, it } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { describe } from "../../lib/with-bridge";
import { expectTrace } from "../../lib/expect-trace";

describe("vercel deployment: api inbound", {}, (props) => {
  it("should trace api for serverless", async () => {
    const { port, collector, bridge } = props();

    const execResp = await bridge.fetch(
      `/api/service/baz?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port}`
      )}`
    );
    expect(execResp.status).toBe(200);
    expect(await execResp.text()).toEqual("Success baz bar");

    await expectTrace(collector, {
      name: "GET /api/service/[slug]/route",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      parentSpanId: undefined,
      resource: {
        "service.name": "sample-app",
        "vercel.runtime": "nodejs",
        env: "test",
      },
      attributes: {
        scope: "next.js",
        client: "bridge",
        "vercel.request_id": "request1",
        "next.span_name": "GET /api/service/[slug]/route",
        "next.span_type": "BaseServer.handleRequest",
        "http.method": "GET",
        "http.host": `127.0.0.1:${port}`,
        "http.status_code": 200,
        "next.route": "/api/service/[slug]/route",
        "http.route": "/api/service/[slug]/route",
      },
      spans: [
        {
          name: "executing api route (app) /api/service/[slug]/route",
          kind: SpanKind.INTERNAL,
          attributes: {
            scope: "next.js",
            "next.span_name":
              "executing api route (app) /api/service/[slug]/route",
            "next.span_type": "AppRouteRouteHandlers.runHandler",
            "next.route": "/api/service/[slug]/route",
          },
          spans: [
            {
              name: "sample-span",
              kind: SpanKind.INTERNAL,
              attributes: { scope: "sample", foo: "bar" },
              spans: [
                {
                  name: `fetch POST http://localhost:${bridge.port}/`,
                  attributes: {
                    scope: "@vercel/otel/fetch",
                    "http.method": "POST",
                    "http.url": `http://localhost:${bridge.port}/`,
                    "net.peer.name": "localhost",
                    "net.peer.port": `${bridge.port}`,
                  },
                  spans: [],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("should trace render for edge", async () => {
    const { collector, bridge } = props();

    const execResp = await bridge.fetch(
      `/api/service/baz/edge?dataUrl=${encodeURIComponent(
        `http://localhost:${bridge.port}`
      )}`
    );
    expect(execResp.status).toBe(200);
    expect(await execResp.text()).toEqual("Success edge baz bar");

    await expectTrace(collector, {
      name: "executing api route (app) /api/service/[slug]/edge/route",
      resource: {
        "service.name": "sample-app",
        "vercel.runtime": "edge",
        env: "test",
      },
      kind: SpanKind.INTERNAL,
      attributes: {
        scope: "next.js",
        client: "bridge",
        "vercel.request_id": "request1",
        "next.span_name":
          "executing api route (app) /api/service/[slug]/edge/route",
        "next.span_type": "AppRouteRouteHandlers.runHandler",
        "next.route": "/api/service/[slug]/edge/route",
      },
      spans: [
        {
          name: "sample-span",
          kind: SpanKind.INTERNAL,
          attributes: { scope: "sample", foo: "bar" },
          spans: [
            {
              name: `fetch POST http://localhost:${bridge.port}/`,
              attributes: {
                scope: "@vercel/otel/fetch",
                "http.method": "POST",
                "http.url": `http://localhost:${bridge.port}/`,
                "net.peer.name": "localhost",
                "net.peer.port": `${bridge.port}`,
              },
              spans: [],
            },
          ],
        },
      ],
    });
  });
});
