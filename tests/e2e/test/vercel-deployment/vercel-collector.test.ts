import { expect, it } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { describe } from "../../lib/with-bridge";
import { expectTrace } from "../../lib/expect-trace";

describe(
  "vercel deployment: collector",
  {
    collector: {
      port: 43181,
    },
    env: {
      VERCEL_OTEL_ENDPOINTS: "specified",
      VERCEL_OTEL_ENDPOINTS_PORT: "43181",
      VERCEL_OTEL_ENDPOINTS_PROTOCOL: "http/json",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
    },
  },
  (props) => {
    it("should trace render for serverless", async () => {
      const { collector, bridge } = props();

      const execResp = await bridge.fetch("/slugs/baz");
      expect(execResp.status).toBe(200);

      await expectTrace(collector, {
        name: "GET /slugs/[slug]",
        status: { code: SpanStatusCode.UNSET },
        kind: SpanKind.SERVER,
        resource: {
          "service.name": "sample-app",
          "vercel.runtime": "nodejs",
          env: "test",
        },
        attributes: {
          scope: "next.js",
          "next.span_name": "GET /slugs/[slug]",
          "next.span_type": "BaseServer.handleRequest",
          "http.method": "GET",
          "http.target": "/slugs/baz",
          "http.status_code": 200,
          "next.route": "/slugs/[slug]",
          "http.route": "/slugs/[slug]",
        },
        spans: [
          {
            name: "render route (app) /slugs/[slug]",
            kind: SpanKind.INTERNAL,
            attributes: {
              scope: "next.js",
              "next.span_name": "render route (app) /slugs/[slug]",
              "next.span_type": "AppRender.getBodyResult",
              "next.route": "/slugs/[slug]",
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

      const execResp = await bridge.fetch("/slugs/baz/edge");
      expect(execResp.status).toBe(200);

      await expectTrace(collector, {
        name: "GET /slugs/[slug]/edge",
        status: { code: SpanStatusCode.UNSET },
        kind: SpanKind.SERVER,
        resource: {
          "service.name": "sample-app",
          "vercel.runtime": "edge",
          env: "test",
        },
        attributes: {
          scope: "next.js",
          "next.span_name": "GET /slugs/[slug]/edge",
          "next.span_type": "BaseServer.handleRequest",
          "http.method": "GET",
          "http.status_code": 200,
          "next.route": "/slugs/[slug]/edge",
          "http.route": "/slugs/[slug]/edge",
        },
        spans: [
          {
            name: "render route (app) /slugs/[slug]/edge",
            kind: SpanKind.INTERNAL,
            attributes: {
              scope: "next.js",
              "next.span_name": "render route (app) /slugs/[slug]/edge",
              "next.span_type": "AppRender.getBodyResult",
              "next.route": "/slugs/[slug]/edge",
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
  },
);
