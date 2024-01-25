import type { NextRequest, NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";
import { Span, SpanStatusCode, trace as traceApi } from "@opentelemetry/api";

export const config: {
  matcher: string[];
} = {
  matcher: ["/behind-middleware/:path*"],
};

export async function middleware(
  request: NextRequest,
  event?: NextFetchEvent
): Promise<Response> {
  const pathname = request.nextUrl.pathname;
  return trace(`middleware ${request.method} ${pathname}`, async () => {
    return NextResponse.next();
  });
}

function trace<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  const tracer = traceApi.getTracer("sample");
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = fn(span);
      span.end();
      return result;
    } catch (e) {
      if (e instanceof Error) {
        span.recordException(e);
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: JSON.stringify(e),
        });
      }
      span.end();
      throw e;
    }
  });
}
