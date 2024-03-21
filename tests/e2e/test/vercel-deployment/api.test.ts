import { expect, it } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { describe } from "../../lib/with-bridge";
import { expectTrace } from "../../lib/expect-trace";

describe("vercel deployment: api", {}, (props) => {
  it("should trace api for serverless", async () => {
    const { port, collector, bridge } = props();

    const execResp = await bridge.fetch("/api/service/baz");
    expect(execResp.status).toBe(200);
    expect(await execResp.text()).toEqual("Success baz <no data>");

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
        "next.span_name": "GET /api/service/[slug]/route",
        "next.span_type": "BaseServer.handleRequest",
        "http.method": "GET",
        "http.target": "/api/service/baz",
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
              spans: [],
            },
          ],
        },
      ],
    });
  });

  it("should trace render for edge", async () => {
    const { collector, bridge } = props();

    const execResp = await bridge.fetch("/api/service/baz/edge");
    expect(execResp.status).toBe(200);
    expect(await execResp.text()).toEqual("Success edge baz <no data>");

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
          spans: [],
        },
      ],
    });
  });
});
