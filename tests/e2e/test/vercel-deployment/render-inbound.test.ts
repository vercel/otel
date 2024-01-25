import { it } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { describe } from "../../lib/with-bridge";
import { expectTrace } from "../../lib/expect-trace";

const EXTERNAL = {
  traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
  spanId: "0f6a325411bdc432",
} as const;

describe("vercel deployment: inbound propagation", {}, (props) => {
  it("should propagate inbound context for serverless", async () => {
    const { collector, bridge } = props();

    await bridge.fetch("/slugs/baz", {
      headers: {
        traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
      },
    });

    await expectTrace(collector, {
      name: "GET /slugs/[slug]",
      status: { code: SpanStatusCode.UNSET },
      kind: SpanKind.SERVER,
      traceId: EXTERNAL.traceId,
      parentSpanId: EXTERNAL.spanId,
      resource: { "vercel.runtime": "nodejs" },
    });
  });

  it("should propagate inbound context for edge", async () => {
    const { collector, bridge } = props();

    await bridge.fetch("/slugs/baz/edge", {
      headers: {
        traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
      },
    });

    collector.processResourceSpans([
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "sample-app" } },
            { key: "vercel.runtime", value: { stringValue: "edge" } },
          ],
          droppedAttributesCount: 0,
        },
        scopeSpans: [
          {
            spans: [
              {
                name: "ROOT",
                traceId: EXTERNAL.traceId,
                spanId: EXTERNAL.spanId,
                parentSpanId: undefined,
                kind: 0,
                attributes: [],
                startTimeUnixNano: 0,
                endTimeUnixNano: 0,
                droppedAttributesCount: 0,
                droppedEventsCount: 0,
                droppedLinksCount: 0,
                events: [],
                links: [],
                status: { code: 0 },
              },
            ],
          },
        ],
      },
    ]);

    await expectTrace(collector, {
      name: "ROOT",
      resource: { "vercel.runtime": "edge" },
      spans: [
        {
          name: "GET /slugs/baz/edge",
        },
        {
          name: "GET /slugs/[slug]/edge",
          status: { code: SpanStatusCode.UNSET },
          kind: SpanKind.SERVER,
          traceId: EXTERNAL.traceId,
          parentSpanId: EXTERNAL.spanId,
        },
      ],
    });
  });
});
