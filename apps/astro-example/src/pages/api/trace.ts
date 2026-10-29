import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { APIRoute } from "astro";

const tracer = trace.getTracer("astro-example");

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  return tracer.startActiveSpan(
    "astro.api.trace",
    {
      attributes: {
        "http.request.method": request.method,
        "http.route": "/api/trace",
      },
      kind: SpanKind.SERVER,
    },
    async (span) => {
      try {
        if (new URL(request.url).searchParams.has("fail")) {
          throw new Error("Requested trace failure");
        }

        await new Promise((resolve) => setTimeout(resolve, 1_000));

        const { spanId, traceId } = span.spanContext();

        return Response.json({
          ok: true,
          spanId,
          traceId,
        });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
};
