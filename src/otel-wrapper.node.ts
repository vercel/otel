import {
  Context,
  trace,
  context,
  propagation,
  Span,
  SpanStatusCode,
} from "@opentelemetry/api";
import { setSpan } from "@opentelemetry/api/build/src/trace/context-utils";
import { NextApiRequest, NextApiResponse } from "next/types";
import { registerOTel } from "./register-otel.node";

// Same as next/types/NextApiHandler with an optional context arg
export type TracedNextApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  handlerSpan: Span,
  oTelContext: Context
) => unknown | Promise<unknown>;

const DEFAULT_OTEL_SERVICE_NAME = "next-app";

const buildServiceTracerName = (serviceName: string) => `${serviceName}-tracer`;

const getActiveContext = (headers: NextApiRequest["headers"]) => {
  let traceParent = headers.traceparent;

  if (typeof traceParent === "object") {
    traceParent = traceParent[0];
  }

  let traceState = headers.tracestate;
  if (typeof traceState === "object") {
    traceState = traceState[0];
  }

  const activeContext = propagation.extract(context.active(), {
    traceparent: traceParent,
    tracestate: traceState,
  });

  return activeContext;
};

let hasRegisteredOtel = false;

export const traceWithOTel = (originalHandler: TracedNextApiHandler) => {
  const otelServiceName =
    process.env.OTEL_SERVICE_NAME ?? DEFAULT_OTEL_SERVICE_NAME;

  if (!hasRegisteredOtel) {
    registerOTel(otelServiceName);
    hasRegisteredOtel = true;
  }

  const tracer = trace.getTracer(buildServiceTracerName(otelServiceName));

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const activeContext = getActiveContext(req.headers);

    return await tracer.startActiveSpan(
      "handler",
      {},
      activeContext,
      async (handlerSpan) => {
        const ctx = setSpan(context.active(), handlerSpan);

        // We can set extra attributes here on the span

        // Catch exceptions and add their info to parent span
        // before rethrowing
        try {
          const originalResponse = await originalHandler(
            req,
            res,
            handlerSpan,
            ctx
          );

          handlerSpan.end();

          return originalResponse;
        } catch (error) {
          let errorMessage = "Uncaught exception";

          if (error instanceof Error) {
            errorMessage = error.message;
            handlerSpan.recordException(error);
          }
          handlerSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });

          handlerSpan.end();

          throw error;
        }
      }
    );
  };
};
