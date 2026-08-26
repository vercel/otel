import "../instrumentation";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { defineMiddleware } from "astro:middleware";
import { runWithInboundTraceContext } from "./run-with-inbound-trace-context";

const tracer = trace.getTracer("astro-example");

export const onRequest = defineMiddleware(({ request, url }, next) => {
  return runWithInboundTraceContext(request.headers, () =>
    tracer.startActiveSpan(
      `astro.request ${url.pathname}`,
      {
        attributes: {
          "http.request.method": request.method,
          "url.path": url.pathname,
        },
        kind: SpanKind.SERVER,
      },
      async (span) => {
        try {
          const response = await next();
          span.setAttribute("http.response.status_code", response.status);

          if (response.status >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }

          return response;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
});
