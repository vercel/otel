import type { ContextManager, TextMapPropagator } from "@opentelemetry/api";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { ResourceDetectionConfig } from "@opentelemetry/resources";
import type {
  Sampler,
  SpanExporter,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  BasicTracerProvider,
  BatchSpanProcessor,
  RandomIdGenerator,
} from "@opentelemetry/sdk-trace-base";
import {
  metrics,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  propagation,
  context,
} from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {
  detectResources,
  envDetector,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  parseKeyPairsIntoRecord,
} from "@opentelemetry/core";
import * as SemanticResourceAttributes from "./semantic-resource-attributes";
import { CompositeSpanProcessor } from "./processor/composite-span-processor";
import { OTLPHttpJsonTraceExporter } from "./exporters/exporter-trace-otlp-http-fetch";
import { OTLPHttpProtoTraceExporter } from "./exporters/exporter-trace-otlp-proto-fetch";
import { omitUndefinedAttributes } from "./util/attributes";
import type {
  Configuration,
  InstrumentationConfiguration,
  InstrumentationOptionOrName,
  PropagatorOrName,
  SampleOrName,
  SpanProcessorOrName,
} from "./types";
import { FetchInstrumentation } from "./instrumentations/fetch";
import { W3CTraceContextPropagator } from "./propagators/w3c-tracecontext-propagator";
import { VercelRuntimePropagator } from "./vercel-request-context/propagator";
import { VercelRuntimeSpanExporter } from "./vercel-request-context/exporter";
import { getStringFromEnv, getStringListFromEnv } from "./utils/env-parser";
import { FilterWhenDrainedSpanProcessor } from "./processor/filter-when-drained-span-processor";

interface Env {
  OTEL_SDK_DISABLED?: string;
  OTEL_SERVICE_NAME?: string;
  OTEL_PROPAGATORS?: string[];
  OTEL_TRACES_SAMPLER?: string;
  OTEL_TRACES_SAMPLER_ARG?: string;
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_EXPORTER_OTLP_TRACES_HEADERS?: string;
  OTEL_EXPORTER_OTLP_TRACES_PROTOCOL?: string;
  OTEL_EXPORTER_OTLP_PROTOCOL?: string;
}

const logLevelMap: Record<string, DiagLogLevel> = {
  ALL: DiagLogLevel.ALL,
  VERBOSE: DiagLogLevel.VERBOSE,
  DEBUG: DiagLogLevel.DEBUG,
  INFO: DiagLogLevel.INFO,
  WARN: DiagLogLevel.WARN,
  ERROR: DiagLogLevel.ERROR,
  NONE: DiagLogLevel.NONE,
};

export class Sdk {
  private contextManager: ContextManager | undefined;
  private tracerProvider: BasicTracerProvider | undefined;
  private loggerProvider: LoggerProvider | undefined;
  private meterProvider: MeterProvider | undefined;
  private disableInstrumentations: (() => void) | undefined;

  public constructor(private configuration: Configuration = {}) {}

  public start(): void {
    const env = getEnv();
    const configuration = this.configuration;
    const runtime = process.env.NEXT_RUNTIME || "nodejs";

    const disabled = Boolean(env.OTEL_SDK_DISABLED);

    // Default is INFO, use environment without defaults to check
    // if the user originally set the environment variable.
    if (process.env.OTEL_LOG_LEVEL) {
      diag.setLogger(new DiagConsoleLogger(), {
        logLevel: logLevelMap[process.env.OTEL_LOG_LEVEL.toUpperCase()],
      });
    }

    if (disabled) {
      return;
    }

    const idGenerator = configuration.idGenerator ?? new RandomIdGenerator();

    this.contextManager = setupContextManager(configuration.contextManager);

    const serviceName =
      env.OTEL_SERVICE_NAME || configuration.serviceName || "app";
    let resource = resourceFromAttributes(
      omitUndefinedAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,

        // Node.
        "node.ci": process.env.CI ? true : undefined,
        "node.env": process.env.NODE_ENV,

        // Vercel.
        // https://vercel.com/docs/projects/environment-variables/system-environment-variables
        // Vercel Env set as top level attribute for simplicity. One of 'production', 'preview' or 'development'.
        env: process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV,
        "vercel.region": process.env.VERCEL_REGION,
        "vercel.runtime": runtime,
        "vercel.sha":
          process.env.VERCEL_GIT_COMMIT_SHA ||
          process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
        "vercel.host":
          process.env.VERCEL_URL ||
          process.env.NEXT_PUBLIC_VERCEL_URL ||
          undefined,
        "vercel.branch_host":
          process.env.VERCEL_BRANCH_URL ||
          process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ||
          undefined,
        "vercel.deployment_id": process.env.VERCEL_DEPLOYMENT_ID || undefined,
        [SemanticResourceAttributes.SERVICE_VERSION]:
          process.env.VERCEL_DEPLOYMENT_ID,
        "vercel.project_id": process.env.VERCEL_PROJECT_ID || undefined,

        ...configuration.attributes,
      }),
    );
    const resourceDetectors = configuration.resourceDetectors ?? [envDetector];
    const autoDetectResources = configuration.autoDetectResources ?? true;
    if (autoDetectResources) {
      const internalConfig: ResourceDetectionConfig = {
        detectors: resourceDetectors,
      };
      const detectedResource = detectResources(internalConfig);
      // Let async resource detection happen in background - don't wait for it
      resource = resource.merge(detectedResource);
    }

    const propagators = parsePropagators(
      configuration.propagators,
      configuration,
      env,
    );
    const traceSampler = parseSampler(configuration.traceSampler, env);
    const spanProcessors = parseSpanProcessor(
      configuration.spanProcessors,
      configuration,
      env,
    );
    if (spanProcessors.length === 0) {
      diag.warn(
        "@vercel/otel: No span processors configured. No spans will be exported.",
      );
    }
    const spanLimits = configuration.spanLimits;
    const tracerProvider = new BasicTracerProvider({
      resource,
      idGenerator,
      sampler: traceSampler,
      spanLimits,
      spanProcessors: [
        new CompositeSpanProcessor(
          spanProcessors,
          configuration.attributesFromHeaders,
        ),
      ],
    });
    trace.setGlobalTracerProvider(tracerProvider);
    propagation.setGlobalPropagator(new CompositePropagator({ propagators }));
    this.tracerProvider = tracerProvider;

    if (configuration.logRecordProcessors) {
      const loggerProvider = new LoggerProvider({
        resource,
        processors: configuration.logRecordProcessors,
      });

      this.loggerProvider = loggerProvider;
      logs.setGlobalLoggerProvider(loggerProvider);
    }

    if (configuration.metricReaders || configuration.views) {
      const meterProvider = new MeterProvider({
        resource,
        views: configuration.views ?? [],
        readers: configuration.metricReaders ?? [],
      });
      metrics.setGlobalMeterProvider(meterProvider);
      this.meterProvider = meterProvider;
    }

    const instrumentations = parseInstrumentations(
      configuration.instrumentations,
      configuration.instrumentationConfig,
    );
    this.disableInstrumentations = registerInstrumentations({
      instrumentations,
    });

    diag.info("@vercel/otel: started", serviceName, runtime);
  }

  public async shutdown(): Promise<void> {
    const promises: Promise<unknown>[] = [];

    if (this.tracerProvider) {
      promises.push(this.tracerProvider.shutdown());
    }
    if (this.loggerProvider) {
      promises.push(this.loggerProvider.shutdown());
    }
    if (this.meterProvider) {
      promises.push(this.meterProvider.shutdown());
    }

    diag.info(
      "@vercel/otel: shutting down",
      promises.length,
      process.env.NEXT_RUNTIME,
    );

    await Promise.all(promises);

    if (this.contextManager) {
      this.contextManager.disable();
    }
    const { disableInstrumentations } = this;
    if (disableInstrumentations) {
      disableInstrumentations();
    }
  }
}

function getEnv(): Env {
  return {
    OTEL_SDK_DISABLED: getStringFromEnv("OTEL_SDK_DISABLED"),
    OTEL_SERVICE_NAME: getStringFromEnv("OTEL_SERVICE_NAME"),
    OTEL_PROPAGATORS: getStringListFromEnv("OTEL_PROPAGATORS"),
    OTEL_TRACES_SAMPLER: getStringFromEnv("OTEL_TRACES_SAMPLER"),
    OTEL_TRACES_SAMPLER_ARG: getStringFromEnv("OTEL_TRACES_SAMPLER_ARG"),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: getStringFromEnv(
      "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    ),
    OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: getStringFromEnv(
      "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
    ),
    OTEL_EXPORTER_OTLP_PROTOCOL: getStringFromEnv(
      "OTEL_EXPORTER_OTLP_PROTOCOL",
    ),
    OTEL_EXPORTER_OTLP_ENDPOINT: getStringFromEnv(
      "OTEL_EXPORTER_OTLP_ENDPOINT",
    ),
    OTEL_EXPORTER_OTLP_HEADERS: getStringFromEnv("OTEL_EXPORTER_OTLP_HEADERS"),
    OTEL_EXPORTER_OTLP_TRACES_HEADERS: getStringFromEnv(
      "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
    ),
  };
}

function parseInstrumentations(
  arg: InstrumentationOptionOrName[] | undefined,
  instrumentationConfig: InstrumentationConfiguration | undefined,
): Instrumentation[] {
  return (arg ?? ["auto"])
    .map((instrumentationOrName) => {
      if (instrumentationOrName === "auto") {
        diag.debug(
          "@vercel/otel: Configure instrumentations: fetch",
          instrumentationConfig?.fetch,
        );
        return [new FetchInstrumentation(instrumentationConfig?.fetch)];
      }
      if (instrumentationOrName === "fetch") {
        diag.debug(
          "@vercel/otel: Configure instrumentations: fetch",
          instrumentationConfig?.fetch,
        );
        return new FetchInstrumentation(instrumentationConfig?.fetch);
      }
      return instrumentationOrName;
    })
    .flat();
}

function parsePropagators(
  arg: PropagatorOrName[] | undefined,
  configuration: Configuration,
  env: Env,
): TextMapPropagator[] {
  const envPropagators =
    process.env.OTEL_PROPAGATORS &&
    env.OTEL_PROPAGATORS &&
    env.OTEL_PROPAGATORS.length > 0
      ? env.OTEL_PROPAGATORS
      : undefined;
  return (arg ?? envPropagators ?? ["auto"])
    .map((propagatorOrName) => {
      if (propagatorOrName === "none") {
        return [];
      }
      if (propagatorOrName === "auto") {
        const autoList: { name: string; propagator: TextMapPropagator }[] = [];
        autoList.push({
          name: "tracecontext",
          propagator: new W3CTraceContextPropagator(),
        });
        autoList.push({
          name: "baggage",
          propagator: new W3CBaggagePropagator(),
        });
        autoList.push({
          name: "vercel-runtime",
          propagator: new VercelRuntimePropagator(),
        });

        diag.debug(
          `@vercel/otel: Configure propagators: ${autoList
            .map((i) => i.name)
            .join(", ")}`,
        );
        return autoList.map((i) => i.propagator);
      }
      if (propagatorOrName === "tracecontext") {
        diag.debug("@vercel/otel: Configure propagator: tracecontext");
        return new W3CTraceContextPropagator();
      }
      if (propagatorOrName === "baggage") {
        diag.debug("@vercel/otel: Configure propagator: baggage");
        return new W3CBaggagePropagator();
      }
      if (typeof propagatorOrName === "string") {
        throw new Error(`Unknown propagator: "${propagatorOrName}"`);
      }
      return propagatorOrName;
    })
    .flat();
}

const FALLBACK_OTEL_TRACES_SAMPLER = "always_on";
const DEFAULT_RATIO = 1;

/**
 * The code below is borrowed from the https://github.com/open-telemetry/opentelemetry-js/blob/b6e532bf52c9553e51aa6d3375e85f0dd9bd67c1/packages/opentelemetry-sdk-trace-base/src/config.ts#L64
 * bacause, unfortunately, OpenTelemetry API doesn't export it directly.
 */
function parseSampler(arg: SampleOrName | undefined, env: Env): Sampler {
  if (arg && typeof arg !== "string") {
    return arg;
  }

  const name =
    arg && arg !== "auto"
      ? arg
      : env.OTEL_TRACES_SAMPLER || FALLBACK_OTEL_TRACES_SAMPLER;
  diag.debug("@vercel/otel: Configure sampler: ", name);
  switch (name) {
    case "always_on":
      return new AlwaysOnSampler();
    case "always_off":
      return new AlwaysOffSampler();
    case "parentbased_always_on":
      return new ParentBasedSampler({
        root: new AlwaysOnSampler(),
      });
    case "parentbased_always_off":
      return new ParentBasedSampler({
        root: new AlwaysOffSampler(),
      });
    case "traceidratio":
      return new TraceIdRatioBasedSampler(getSamplerProbabilityFromEnv(env));
    case "parentbased_traceidratio":
      return new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(getSamplerProbabilityFromEnv(env)),
      });
    default:
      diag.error(
        `@vercel/otel: OTEL_TRACES_SAMPLER value "${String(
          env.OTEL_TRACES_SAMPLER,
        )} invalid, defaulting to ${FALLBACK_OTEL_TRACES_SAMPLER}".`,
      );
      return new AlwaysOnSampler();
  }
}

function getSamplerProbabilityFromEnv(env: Env): number {
  if (
    env.OTEL_TRACES_SAMPLER_ARG === undefined ||
    env.OTEL_TRACES_SAMPLER_ARG === ""
  ) {
    diag.error(
      `@vercel/otel: OTEL_TRACES_SAMPLER_ARG is blank, defaulting to ${DEFAULT_RATIO}.`,
    );
    return DEFAULT_RATIO;
  }

  diag.debug(
    "@vercel/otel: Configure sampler probability: ",
    env.OTEL_TRACES_SAMPLER_ARG,
  );
  const probability = Number(env.OTEL_TRACES_SAMPLER_ARG);

  if (isNaN(probability)) {
    diag.error(
      `@vercel/otel: OTEL_TRACES_SAMPLER_ARG=${env.OTEL_TRACES_SAMPLER_ARG} was given, but it is invalid, defaulting to ${DEFAULT_RATIO}.`,
    );
    return DEFAULT_RATIO;
  }

  if (probability < 0 || probability > 1) {
    diag.error(
      `@vercel/otel: OTEL_TRACES_SAMPLER_ARG=${env.OTEL_TRACES_SAMPLER_ARG} was given, but it is out of range ([0..1]), defaulting to ${DEFAULT_RATIO}.`,
    );
    return DEFAULT_RATIO;
  }

  return probability;
}

function parseSpanProcessor(
  arg: SpanProcessorOrName[] | undefined,
  configuration: Configuration,
  env: Env,
): SpanProcessor[] {
  return [
    ...(arg ?? ["auto"])
      .flatMap((spanProcessorOrName) => {
        if (spanProcessorOrName === "auto") {
          const processors: SpanProcessor[] = [
            new BatchSpanProcessor(new VercelRuntimeSpanExporter()),
          ];

          if (process.env.VERCEL_OTEL_ENDPOINTS) {
            // OTEL collector is configured on 4318 port.
            const port = process.env.VERCEL_OTEL_ENDPOINTS_PORT || "4318";
            // It's important to use x-protobuf here because the Vercel collector
            // doesn't correctly process `TimeUnixNano{low, high}` encoding.
            const protocol =
              process.env.VERCEL_OTEL_ENDPOINTS_PROTOCOL || "http/protobuf";
            diag.debug(
              "@vercel/otel: Configure vercel otel collector on port: ",
              port,
              protocol,
            );
            const config = {
              url: `http://localhost:${port}/v1/traces`,
              headers: {},
            };
            const exporter =
              protocol === "http/protobuf"
                ? new OTLPHttpProtoTraceExporter(config)
                : new OTLPHttpJsonTraceExporter(config);

            processors.push(
              new FilterWhenDrainedSpanProcessor(
                new BatchSpanProcessor(exporter),
              ),
            );
          }

          // Consider going throw `VERCEL_OTEL_ENDPOINTS` (otel collector) for OTLP.
          else if (
            !configuration.traceExporter ||
            configuration.traceExporter === "auto" ||
            env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
            env.OTEL_EXPORTER_OTLP_ENDPOINT
          ) {
            processors.push(
              new FilterWhenDrainedSpanProcessor(
                new BatchSpanProcessor(parseTraceExporter(env)),
              ),
            );
          }

          return processors;
        }
        return spanProcessorOrName;
      })
      .filter(isNotNull),
    ...(configuration.traceExporter && configuration.traceExporter !== "auto"
      ? [new BatchSpanProcessor(configuration.traceExporter)]
      : []),
  ];
}

/**
 * This code is moved from the https://github.com/open-telemetry/opentelemetry-js/blob/00e78efd840d3f49d9d4b025a9965e8d3f2913ad/experimental/packages/opentelemetry-sdk-node/src/TracerProviderWithEnvExporter.ts#L41
 * due to the https://github.com/open-telemetry/opentelemetry-js/issues/4212
 */
function parseTraceExporter(env: Env): SpanExporter {
  const protocol =
    env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ??
    env.OTEL_EXPORTER_OTLP_PROTOCOL ??
    "http/protobuf";
  const url = buildExporterUrlFromEnv(env);
  const headers = {
    ...(env.OTEL_EXPORTER_OTLP_HEADERS
      ? parseKeyPairsIntoRecord(env.OTEL_EXPORTER_OTLP_HEADERS)
      : {}),
    ...(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS
      ? parseKeyPairsIntoRecord(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS)
      : {}),
  };
  diag.debug(
    "@vercel/otel: Configure trace exporter: ",
    protocol,
    url,
    `headers: ${Object.keys(headers).join(",") || "<none>"}`,
  );
  switch (protocol) {
    case "http/json":
      return new OTLPHttpJsonTraceExporter({ url, headers });
    case "http/protobuf":
      return new OTLPHttpProtoTraceExporter({ url, headers });
    default:
      // "grpc" protocol is not supported in Edge.
      diag.warn(
        `@vercel/otel: Unsupported OTLP traces protocol: ${protocol}. Using http/protobuf.`,
      );
      return new OTLPHttpProtoTraceExporter();
  }
}

const DEFAULT_COLLECTOR_RESOURCE_PATH = "v1/traces";
const DEFAULT_COLLECTOR_URL = `http://localhost:4318/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;

function buildExporterUrlFromEnv(env: Env): string {
  const defaultUrlFromEnv = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (defaultUrlFromEnv && typeof defaultUrlFromEnv === "string") {
    return defaultUrlFromEnv;
  }

  const defaultUrlFromEnvAll = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (defaultUrlFromEnvAll && typeof defaultUrlFromEnvAll === "string") {
    return `${defaultUrlFromEnvAll}/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;
  }

  return DEFAULT_COLLECTOR_URL;
}

function isNotNull<T>(x: T | null | undefined): x is T {
  return x !== null && x !== undefined;
}

function setupContextManager(
  contextManager: ContextManager | undefined,
): ContextManager {
  // undefined means 'register default'
  if (contextManager === undefined) {
    diag.debug("@vercel/otel: Configure context manager: default");
    const defaultContextManager = new AsyncLocalStorageContextManager();
    defaultContextManager.enable();
    context.setGlobalContextManager(defaultContextManager);
    return defaultContextManager;
  }

  diag.debug("@vercel/otel: Configure context manager: from configuration");
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  return contextManager;
}
