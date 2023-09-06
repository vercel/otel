import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";

export const registerOTel = (serviceName: string) => {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    // For now, we'll support the simple span processor.
    // In the future, we want to change this to a batch span processor that
    // takes advantage of the `waitUntil` API to ensure that the batch is sent
    // and does not interfere with the page lifecycle.
    spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter()),
  });
  sdk.start();
};
