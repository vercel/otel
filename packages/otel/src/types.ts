import type {
  TextMapPropagator,
  ContextManager,
  TextMapGetter,
  Attributes,
} from "@opentelemetry/api";
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

/**
 * OpenTelemetry SDK configuration.
 */
export interface Configuration {
  /**
   * The name of your service, used as the app name in many OpenTelemetry backends.
   * Can be overriden by the `OTEL_SERVICE_NAME` environment variable.
   */
  serviceName?: string;

  /**
   * The additional resource attributes to apply to all spans.
   * By default, `@vercel/otel` configures relevant Vercel attributes based on the
   * [environment](https://vercel.com/docs/projects/environment-variables/system-environment-variables),
   * including:
   * - `service.name` - the service name.
   * - `node.env` - the value of `NODE_ENV` environment variable.
   * - `env` - the Vercel deployment environment such as "production" or "preview" (`VERCEL_ENV` environment variable).
   * - `vercel.region` - the Vercel deployment region (`VERCEL_REGION` environment variable).
   * - `vercel.runtime` - "nodejs" or "edge" (`NEXT_RUNTIME` environment variable).
   * - `vercel.sha` - the Vercel deployment Git SHA (`VERCEL_GIT_COMMIT_SHA` environment variable).
   * - `vercel.host` - the Vercel deployment host for the Git SHA (`VERCEL_URL` environment variable).
   * - `vercel.branch_host` - the Vercel deployment host for the branch (`VERCEL_BRANCH_URL` environment variable).
   * - `vercel.deployment_id` - the Vercel deployment ID (`VERCEL_DEPLOYMENT_ID` environment variable).
   *
   * Any additional attributes will be merged with the default attributes.
   */
  attributes?: ResourceAttributes;

  /**
   * This configuration is used to compute root span's attributes based on the request's headers.
   * The value can be one of the following:
   * - A map with keys as attribute names and values as header names. An attribute would only
   *   be created if the specified header exists.
   * - A function that can take an opaque headers object with the getter callback, and returns
   *   a set of computed attributes.
   */
  attributesFromHeaders?: AttributesFromHeaders;

  resourceDetectors?: DetectorSync[];
  autoDetectResources?: boolean;

  /**
   * A set of instrumentations.
   * By default, `@vercel/otel` configures ["fetch"](FetchInstrumentationConfig) instrumentation.
   */
  instrumentations?: InstrumentationOptionOrName[];

  /**
   * Customize configuration for predefined instrumentations:
   * - [fetch](FetchInstrumentationConfig)
   */
  instrumentationConfig?: InstrumentationConfiguration;

  contextManager?: ContextManager;
  idGenerator?: IdGenerator;

  /**
   * A set of propagators that may extend inbound and outbound contexts.
   * Use the "auto" value to include all default propagators.
   * By default, `@vercel/otel` configures [W3C Trace Context](https://www.w3.org/TR/trace-context/) propagator.
   * This option can be also configured via the [`OTEL_PROPAGATORS`](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) environment variable.
   *
   * Example: `{ propagators: ["auto", new MyPropagator()] }`
   */
  propagators?: PropagatorOrName[];

  /**
   * The sampler to be used to decide which requests should be traced.
   * Use the "auto" value to use the default sampler.
   * By default, all requests are traced. This option can be changed to,
   * for instance, only trace 1% of all requests.
   * This option can also be configured via the [`OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG`](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) environment variable.
   */
  traceSampler?: SampleOrName;

  /**
   * A set of span processors to be used to process captured spans.
   * Use the "auto" value to include all default span processors.
   * By default, `@vercel/otel` auto-configures an export processor based on the environment.
   * See [traceExporter](Configuration#traceExporter) for more details.
   */
  spanProcessors?: SpanProcessorOrName[];

  /**
   * A custom exporter for traces.
   * Use the "auto" value to include the best export mechanism for the environment.
   * By default, `@vercel/otel` configures the best export mechanism for the
   * environment. For instance, if a [tracing integrations](https://vercel.com/docs/observability/otel-overview) is
   * configured on Vercel, this integration will be automatically used for export; otherwise an
   * [OTLP exporter](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#otlp-exporter)
   * can be used if configured via environment variables, such as `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`
   * and `OTEL_EXPORTER_OTLP_HEADERS`.
   */
  traceExporter?: SpanExporterOrName;

  spanLimits?: SpanLimits;

  logRecordProcessor?: LogRecordProcessor;
  metricReader?: MetricReader;
  views?: View[];
}

export type AttributesFromHeaderFunc = <Carrier = unknown>(
  headers: Carrier,
  getter: TextMapGetter<Carrier>
) => Attributes | undefined;

export type AttributesFromHeaders =
  | Record<string, string>
  | AttributesFromHeaderFunc;
