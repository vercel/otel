import type { TextMapPropagator, ContextManager } from "@opentelemetry/api";
import type { InstrumentationOption } from "@opentelemetry/instrumentation";
import type {
  DetectorSync,
  ResourceAttributes,
} from "@opentelemetry/resources";
import type { LogRecordProcessor } from "@opentelemetry/sdk-logs";
import type {
  IdGenerator,
  Sampler,
  SpanExporter,
  SpanLimits,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { MetricReader, View } from "@opentelemetry/sdk-metrics";
import type { FetchInstrumentationConfig } from "./instrumentations/fetch";

export type PropagatorOrName =
  | TextMapPropagator
  | "auto"
  | "none"
  | "tracecontext"
  | "baggage";

export type SampleOrName =
  | Sampler
  | "auto"
  | "always_off"
  | "always_on"
  | "parentbased_always_off"
  | "parentbased_always_on"
  | "parentbased_traceidratio"
  | "traceidratio";

export type SpanProcessorOrName = SpanProcessor | "auto";

export type SpanExporterOrName = SpanExporter | "auto";

export type InstrumentationOptionOrName =
  | InstrumentationOption
  | "fetch"
  | "auto";

export interface InstrumentationConfiguration {
  fetch?: FetchInstrumentationConfig;
}

export interface Configuration {
  serviceName?: string;
  attributes?: ResourceAttributes;
  resourceDetectors?: DetectorSync[];
  autoDetectResources?: boolean;

  instrumentations?: InstrumentationOptionOrName[];
  instrumentationConfig?: InstrumentationConfiguration;

  contextManager?: ContextManager;
  idGenerator?: IdGenerator;
  propagators?: PropagatorOrName[];

  traceSampler?: SampleOrName;
  spanProcessors?: SpanProcessorOrName[];
  traceExporter?: SpanExporterOrName;
  spanLimits?: SpanLimits;

  logRecordProcessor?: LogRecordProcessor;
  metricReader?: MetricReader;
  views?: View[];
}
