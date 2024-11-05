import {registerOTel, OTLPHttpJsonTraceExporter, OTLPHttpProtoTraceExporter  } from "@vercel/otel";
import {
  BatchSpanProcessor
} from "@opentelemetry/sdk-trace-base";

export function register() {

  registerOTel({
    serviceName: "sample-app",
    spanProcessors: [
      // Exports to Vercel OTEL collector
      'auto',
      // Exports to Axiom
      new BatchSpanProcessor(new OTLPHttpJsonTraceExporter({ url: 'https://api.axiom.co/v1/traces', headers: {
        'Authorization': `Bearer ${process.env.AXIOM_API_TOKEN}`, // Replace $API_TOKEN with your actual API token
        'X-Axiom-Dataset': process.env.AXIOM_DATASET // Replace $DATASET with your dataset
      } })),
      // Exports to Checkly
      new BatchSpanProcessor(new OTLPHttpProtoTraceExporter({ url: "https://otel.eu-west-1.checklyhq.com", headers: { 'authorization': process.env.CHECKLY_API_TOKEN } })),
    ],
    instrumentationConfig: {
      fetch: {
        ignoreUrls: [/^https:\/\/telemetry.nextjs.org/],
        propagateContextUrls: [/^http:\/\/localhost:\d+/],
        dontPropagateContextUrls: [/no-propagation\=1/],
        attributesFromRequestHeaders: {
          "request.cmd": "X-Cmd",
        },
        attributesFromResponseHeaders: {
          "response.server": "X-Server",
        },
      },
    },
    attributesFromHeaders: {
      client: "X-Client",
    },
  });
}
