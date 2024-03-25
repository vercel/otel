import { expect, it } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { describe } from "../../lib/with-bridge";
import { expectTrace } from "../../lib/expect-trace";

describe("vercel deployment: middleware", {}, (props) => {
  it("should trace render for serverless", async () => {
    const { port, collector, bridge } = props();

    const execResp = await bridge.fetch("/behind-middleware/baz");
    expect(execResp.status).toBe(200);

    await expectTrace(collector, {
      name: "middleware GET /behind-middleware/baz",
      resource: {
        "service.name": "sample-app",
        "vercel.runtime": "edge",
        env: "test",
      },
      attributes: {
        scope: "next.js",
        "http.method": "GET",
        "http.target": "/behind-middleware/baz",
        "next.span_name": "middleware GET /behind-middleware/baz",
        "next.span_type": "Middleware.execute",
        "operation.name": "next_js.Middleware.execute",
      },
      spans: [
        {
          name: "sample-span",
          attributes: {
            scope: "sample",
            "operation.name": "sample",
          },
        },
      ],
    });

    await expectTrace(collector, {
      name: "GET /behind-middleware/[slug]",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: {
        "service.name": "sample-app",
        "vercel.runtime": "nodejs",
        env: "test",
      },
      attributes: {
        scope: "next.js",
        "next.span_name": "GET /behind-middleware/[slug]",
        "next.span_type": "BaseServer.handleRequest",
        "http.method": "GET",
        "http.host": `127.0.0.1:${port}`,
        "http.status_code": 200,
        "next.route": "/behind-middleware/[slug]",
        "http.route": "/behind-middleware/[slug]",
      },
      spans: [
        {
          name: "render route (app) /behind-middleware/[slug]",
          kind: SpanKind.INTERNAL,
          attributes: {
            scope: "next.js",
            "next.span_name": "render route (app) /behind-middleware/[slug]",
            "next.span_type": "AppRender.getBodyResult",
            "next.route": "/behind-middleware/[slug]",
          },
          spans: [
            {
              name: "sample-span",
              kind: SpanKind.INTERNAL,
              attributes: { scope: "sample", foo: "bar" },
            },
          ],
        },
      ],
    });
  });

  it("should trace render for edge", async () => {
    const { port, collector, bridge } = props();

    const execResp = await bridge.fetch("/behind-middleware/baz/edge");
    expect(execResp.status).toBe(200);

    await expectTrace(collector, {
      name: "middleware GET /behind-middleware/baz/edge",
      resource: {
        "service.name": "sample-app",
        "vercel.runtime": "edge",
        env: "test",
      },
      attributes: {
        scope: "next.js",
        "http.method": "GET",
        "http.target": "/behind-middleware/baz/edge",
        "next.span_name": "middleware GET /behind-middleware/baz/edge",
        "next.span_type": "Middleware.execute",
        "operation.name": "next_js.Middleware.execute",
      },
      spans: [
        {
          name: "sample-span",
          attributes: {
            scope: "sample",
            "operation.name": "sample",
          },
        },
      ],
    });

    await expectTrace(collector, {
      name: "GET /behind-middleware/[slug]/edge",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      resource: {
        "service.name": "sample-app",
        "vercel.runtime": "edge",
        env: "test",
      },
      attributes: {
        scope: "next.js",
        "next.span_name": "GET /behind-middleware/[slug]/edge",
        "next.span_type": "BaseServer.handleRequest",
        "http.method": "GET",
        "http.host": `127.0.0.1:${port}`,
        "http.status_code": 200,
        "next.route": "/behind-middleware/[slug]/edge",
        "http.route": "/behind-middleware/[slug]/edge",
      },
      spans: [
        {
          name: "render route (app) /behind-middleware/[slug]/edge",
          kind: SpanKind.INTERNAL,
          attributes: {
            scope: "next.js",
            "next.span_name":
              "render route (app) /behind-middleware/[slug]/edge",
            "next.span_type": "AppRender.getBodyResult",
            "next.route": "/behind-middleware/[slug]/edge",
          },
          spans: [
            {
              name: "sample-span",
              kind: SpanKind.INTERNAL,
              attributes: { scope: "sample", foo: "bar" },
            },
          ],
        },
      ],
    });
  });
});
