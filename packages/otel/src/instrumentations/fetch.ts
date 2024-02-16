import {
  SpanKind,
  SpanStatusCode,
  propagation,
  context,
} from "@opentelemetry/api";
import type { TextMapSetter, TracerProvider } from "@opentelemetry/api";
import type {
  Instrumentation,
  InstrumentationConfig,
} from "@opentelemetry/instrumentation";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { resolveTemplate } from "../util/template";
import { getVercelRequestContext } from "../vercel-request-context/api";
import { isSampled } from "../util/sampled";

export interface FetchInstrumentationConfig extends InstrumentationConfig {
  ignoreUrls?: (string | RegExp)[];
  propagateContextUrls?: (string | RegExp)[];
  dontPropagateContextUrls?: (string | RegExp)[];
  resourceNameTemplate?: string;
}

type NextRequestInit = RequestInit & {
  next?: {
    internal: boolean;
  };
};

export class FetchInstrumentation implements Instrumentation {
  instrumentationName = "@vercel/otel/fetch";
  instrumentationVersion = "1.0.0";
  /** @internal */
  private config: FetchInstrumentationConfig;
  /** @internal */
  private originalFetch: typeof fetch | undefined;
  /** @internal */
  private tracerProvider: TracerProvider | undefined;

  constructor(config: FetchInstrumentationConfig = {}) {
    this.config = config;
  }

  getConfig(): FetchInstrumentationConfig {
    return this.config;
  }

  setConfig(): void {
    // Nothing.
  }

  setTracerProvider(tracerProvider: TracerProvider): void {
    this.tracerProvider = tracerProvider;
  }

  setMeterProvider(): void {
    // Nothing.
  }

  public enable(): void {
    this.disable();

    const { tracerProvider } = this;
    if (!tracerProvider) {
      return;
    }

    const tracer = tracerProvider.getTracer(
      this.instrumentationName,
      this.instrumentationVersion
    );

    const ignoreUrls = this.config.ignoreUrls ?? [];

    const shouldIgnore = (url: URL): boolean => {
      if (ignoreUrls.length === 0) {
        return false;
      }
      const urlString = url.toString();
      return ignoreUrls.some((match) => {
        if (typeof match === "string") {
          if (match === "*") {
            return true;
          }
          return urlString.startsWith(match);
        }
        return match.test(urlString);
      });
    };

    const host =
      process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || null;
    const branchHost =
      process.env.VERCEL_BRANCH_URL ||
      process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ||
      null;
    const propagateContextUrls = this.config.propagateContextUrls ?? [];
    const dontPropagateContextUrls = this.config.dontPropagateContextUrls ?? [];
    const resourceNameTemplate = this.config.resourceNameTemplate;

    const shouldPropagate = (url: URL): boolean => {
      const urlString = url.toString();
      if (
        dontPropagateContextUrls.length > 0 &&
        dontPropagateContextUrls.some((match) => {
          if (typeof match === "string") {
            if (match === "*") {
              return true;
            }
            return urlString.startsWith(match);
          }
          return match.test(urlString);
        })
      ) {
        return false;
      }
      // Allow same origin.
      if (
        host &&
        url.protocol === "https:" &&
        (url.host === host ||
          url.host === branchHost ||
          url.host === getVercelRequestContext()?.headers.host)
      ) {
        return true;
      }
      // Allow localhost for testing in a dev mode.
      if (!host && url.protocol === "http:" && url.hostname === "localhost") {
        return true;
      }
      return propagateContextUrls.some((match) => {
        if (typeof match === "string") {
          if (match === "*") {
            return true;
          }
          return urlString.startsWith(match);
        }
        return match.test(urlString);
      });
    };

    // Disable fetch tracing in Next.js.
    process.env.NEXT_OTEL_FETCH_DISABLED = "1";

    const originalFetch = globalThis.fetch;
    this.originalFetch = originalFetch;

    const doFetch: typeof fetch = (input, init) => {
      // Passthrough internal requests.
      if ((init as NextRequestInit | undefined)?.next?.internal) {
        return originalFetch(input, init);
      }

      const req = new Request(input, init);
      const url = new URL(req.url);
      if (shouldIgnore(url)) {
        return originalFetch(input, init);
      }

      const attrs = {
        [SemanticAttributes.HTTP_METHOD]: req.method,
        [SemanticAttributes.HTTP_URL]: req.url,
        [SemanticAttributes.HTTP_HOST]: url.host,
        [SemanticAttributes.HTTP_SCHEME]: url.protocol.replace(":", ""),
        [SemanticAttributes.NET_PEER_NAME]: url.hostname,
        [SemanticAttributes.NET_PEER_PORT]: url.port,
      };
      const resourceName = resourceNameTemplate
        ? resolveTemplate(resourceNameTemplate, attrs)
        : removeSearch(req.url);

      return tracer.startActiveSpan(
        `fetch ${req.method} ${req.url}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            ...attrs,
            "operation.name": `fetch.${req.method}`,
            "resource.name": resourceName,
          },
        },
        async (span) => {
          if (
            span.isRecording() &&
            isSampled(span.spanContext().traceFlags) &&
            shouldPropagate(url)
          ) {
            propagation.inject(context.active(), req.headers, HEADERS_SETTER);
          }

          try {
            const res = await originalFetch(input, {
              ...init,
              headers: req.headers,
            });
            span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, res.status);
            if (res.status >= 500) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `Status: ${res.status} (${res.statusText})`,
              });
            }
            span.end();
            return res;
          } catch (e) {
            if (e instanceof Error) {
              span.recordException(e);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: e.message,
              });
            } else {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(e),
              });
            }
            span.end();
            throw e;
          }
        }
      );
    };
    globalThis.fetch = doFetch;
  }

  public disable(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
  }
}

const HEADERS_SETTER: TextMapSetter<Headers> = {
  set(carrier: Headers, key: string, value: string): void {
    carrier.set(key, value);
  },
};

function removeSearch(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.substring(0, index);
}
