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

// Identical to next/types/NextApiHandler with an optional context arg
export type TracedNextApiHandler<TReturn = unknown> = (
  req: NextApiRequest,
  res: NextApiResponse,
  spanAndContext: { handlerSpan: Span; oTelContext: Context }
) => TReturn | Promise<TReturn>;

const DEFAULT_OTEL_SERVICE_NAME = "next-app";

const buildServiceTracerName = (serviceName: string) => `${serviceName}-tracer`;

/**
 * Create OTel context from traceparent and tracestate headers
 *
 * * See W3C spec: https://www.w3.org/TR/trace-context/#design-overview
 *
 * @param headers Next API route request headers
 * @returns OTel active context
 */
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
/**
 * Wrap Next API route handler to enable OTel tracing
 *
 * * Registers OTel service + tracer with name from env var OTEL_SERVICE_NAME
 * * Starts a handler span
 * * Catches errors, adds info to span, rethrows
 *
 * @param originalHandler Your original Next API Route handler
 * @returns Updated handler with tracing enabled
 */
export const traceWithOTel = <TReturn>(
  originalHandler: TracedNextApiHandler<TReturn>
) => {
  const otelServiceName =
    process.env.OTEL_SERVICE_NAME ?? DEFAULT_OTEL_SERVICE_NAME;

  // Register OTel if it hasn't been registered yet
  if (!hasRegisteredOtel) {
    registerOTel(otelServiceName);
    hasRegisteredOtel = true;
  }

  const tracer = trace.getTracer(buildServiceTracerName(otelServiceName));

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const activeContext = getActiveContext(req.headers);

    return await tracer.startActiveSpan(
      "next_api_route_handler",
      {},
      activeContext,
      async (handlerSpan) => {
        const oTelContext = setSpan(context.active(), handlerSpan);

        // Catch exceptions and add their info to parent span before rethrowing
        try {
          const originalResponse = await originalHandler(req, res, {
            handlerSpan,
            oTelContext,
          });

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
