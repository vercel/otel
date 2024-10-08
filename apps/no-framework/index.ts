import { trace as tracing } from "@opentelemetry/api";
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

function setupTelemetry() {
  const resource = new Resource({
    "service.name": "my-app",
    "node.env": process.env.NODE_ENV,
    env: "development",
  });

  const idGenerator = new RandomIdGenerator();
  const contextManager = new AsyncLocalStorageContextManager();

  const spanExporter: SpanExporter = {
    export: (spans, resultCallback) => {
      const resourceSpans = createExportTraceServiceRequest(spans, {
        useHex: true,
        useLongBits: true,
      });
      console.log("[TEL]", JSON.stringify(resourceSpans));
      resultCallback({ code: 0, error: undefined });
    },
    shutdown: () => {
      return Promise.resolve();
    },
  };

  const tracerProvider = new BasicTracerProvider({
    resource,
    idGenerator,
    sampler: new AlwaysOnSampler(),
  });
  tracerProvider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
  tracerProvider.register({ contextManager });
}

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

setupTelemetry();
void handler().then((result) => {
  console.log("Complete. Result = [", result, "]");
});
