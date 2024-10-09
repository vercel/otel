// This is the only import for user code.
import {
  SpanContext,
  TextMapPropagator,
  trace as tracing,
  context as contextApi,
  propagation as propagationApi,
  defaultTextMapGetter,
} from "@opentelemetry/api";

// All these imports are for SDK configuration, not user code.
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  RandomIdGenerator,
  SimpleSpanProcessor,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { Resource } from "@opentelemetry/resources";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";

function bridgeGetContext(): {
  rootSpanContext: SpanContext | undefined;
} {
  return {
    rootSpanContext: {
      traceId: "1111c0c11d8d177d28240e9eb0521111",
      spanId: "1111c0c11d8d1111",
      traceFlags: 1,
      isRemote: true,
    },
  };
}

// This is SDK code. A normal user code doesn't write it, but it calls some
// SDK configuration, such as `registerOTel` from `@vercel/otel`.
function setupTelemetry() {
  // OTEL calls this "resource", while others (such as DataDog) call it "service".
  const resource = new Resource({
    "service.name": "my-app",
    "node.env": process.env.NODE_ENV,
    env: "development",
  });

  const idGenerator = new RandomIdGenerator();
  const contextManager = new AsyncLocalStorageContextManager();

  const spanExporter: SpanExporter = {
    export: (spans, resultCallback) => {
      // Converts a Span to IResourceSpans > IScopeSpans > ISpan structure, which
      // is OTLP format. It's can be directly serialized to JSON or converted
      // to Protobuf.
      const resourceSpans = createExportTraceServiceRequest(spans, {
        // Uses hex-encoding trace and span IDs. Otherwise, base64 is used.
        useHex: true,
        // Uses `{high, low}` format for timestamps. Otherwise, `unixNanon` is used.
        useLongBits: true,
      });
      console.log("[TEL]", JSON.stringify(resourceSpans));
      resultCallback({ code: 0, error: undefined });
    },
    shutdown: () => {
      return Promise.resolve();
    },
  };

  const propagator: TextMapPropagator = {
    inject: () => undefined,
    fields: () => [],

    extract: (context, carrier, getter) => {
      const { rootSpanContext } = bridgeGetContext();
      if (rootSpanContext) {
        return tracing.setSpanContext(context, rootSpanContext);
      }
      return context;
    },
  };

  const tracerProvider = new BasicTracerProvider({
    resource,
    idGenerator,
    sampler: new AlwaysOnSampler(),
  });

  // Simplification. A SimpleSpanProcessor would almost never be used in a real
  // case for exporting.
  tracerProvider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));

  tracerProvider.register({ contextManager, propagator });
}

function callFramework(userHandler: () => Promise<any>) {
  // Extract the propagated trace context from the request and call the user handler
  // in this context.
  // Next.js already does this!
  const req = {};
  const getter = defaultTextMapGetter;
  const active = contextApi.active();
  const context = propagationApi.extract(active, {}, getter);
  return contextApi.with(context, userHandler);
}

setupTelemetry();

// User code. It only uses `@opentelemetry/api` APIs.
async function handler() {
  const tracer = tracing.getTracer("app");
  return tracer.startActiveSpan(
    "handler",
    { attributes: { route: "/api/handler" } },
    async (span) => {
      await tracer.startActiveSpan("slowOperation", async (span) => {
        span.setAttribute("operation", "sleep");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        span.end();
      });
      span.end();
      return "Hello world!";
    }
  );
}

// Bridge calls the user/framework code.
void callFramework(handler).then((result) => {
  console.log("Complete. Result = [", result, "]");
});
