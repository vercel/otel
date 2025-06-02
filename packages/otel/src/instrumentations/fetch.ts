import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace as traceApi,
} from "@opentelemetry/api";
import type {
  Attributes,
  Span,
  SpanStatus,
  TextMapSetter,
  Tracer,
  TracerProvider,
} from "@opentelemetry/api";
import type {
  Instrumentation,
  InstrumentationConfig,
} from "@opentelemetry/instrumentation";
import * as SemanticAttributes from "../semantic-resource-attributes";
import { isSampled } from "../util/sampled";
import { resolveTemplate } from "../util/template";
import { getVercelRequestContext } from "../vercel-request-context/api";
import type { Callback, Http, Https, IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, RequestOptions } from './types';

/**
 * Configuration for the "fetch" instrumentation.
 *
 * Some of this configuration can be overriden on a per-fetch call basis by
 * using the `opentelemetry` property in the `RequestInit` object (requires Next 14.1.1 or above).
 * This property can include:
 * - `ignore`: boolean - whether to ignore the fetch call from tracing. Overrides
 *   `ignoreUrls`.
 * - `propagateContext: boolean`: overrides `propagateContextUrls` for this call.
 * - `spanName: string`: overrides the computed span name for this call.
 * - `attributes: Attributes`: overrides the computed attributes for this call.
 */
export interface FetchInstrumentationConfig extends InstrumentationConfig {
  /**
   * A set of URL matchers (string prefix or regex) that should be ignored from tracing.
   * By default all URLs are traced.
   * Can be overriden by the `opentelemetry.ignore` property in the `RequestInit` object.
   *
   * Example: `fetch: { ignoreUrls: [/example.com/] }`.
   */
  ignoreUrls?: (string | RegExp)[];

  /**
   * A set of URL matchers (string prefix or regex) for which the tracing context
   * should be propagated (see [`propagators`](Configuration#propagators)).
   * By default the context is propagated _only_ for the
   * [deployment URLs](https://vercel.com/docs/deployments/generated-urls), all
   * other URLs should be enabled explicitly.
   * Can be overriden by the `opentelemetry.propagateContext` property in the `RequestInit` object.
   *
   * Example: `fetch: { propagateContextUrls: [ /my.api/ ] }`.
   */
  propagateContextUrls?: (string | RegExp)[];

  /**
   * A set of URL matchers (string prefix or regex) for which the tracing context
   * should not be propagated (see [`propagators`](Configuration#propagators)). This allows you to exclude a
   * subset of URLs allowed by the [`propagateContextUrls`](FetchInstrumentationConfig#propagateContextUrls).
   * Can be overriden by the `opentelemetry.propagateContext` property in the `RequestInit` object.
   */
  dontPropagateContextUrls?: (string | RegExp)[];

  /**
   * A string for the "resource.name" attribute that can include attribute expressions in `{}`.
   * Can be overriden by the `opentelemetry.attributes` property in the `RequestInit` object.
   *
   * Example: `fetch: { resourceNameTemplate: "{http.host}" }`.
   */
  resourceNameTemplate?: string;

  /**
   * A map of attributes that should be created from the request headers. The keys of the map are
   * attribute names and the values are request header names. If a resonse header doesn't exist, no
   * attribute will be created for it.
   *
   * Example: `fetch: { attributesFromRequestHeaders: { "attr1": "X-Attr" } }`
   */
  attributesFromRequestHeaders?: Record<string, string>;

  /**
   * A map of attributes that should be created from the response headers. The keys of the map are
   * attribute names and the values are response header names. If a resonse header doesn't exist, no
   * attribute will be created for it.
   *
   * Example: `fetch: { attributesFromResponseHeaders: { "attr1": "X-Attr" } }`
   */
  attributesFromResponseHeaders?: Record<string, string>;
}

declare global {
  interface RequestInit {
    opentelemetry?: {
      ignore?: boolean;
      propagateContext?: boolean;
      spanName?: string;
      attributes?: Attributes;
    };
  }
}

type InternalRequestInit = RequestInit & {
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
  private shouldIgnore(
    url: URL,
    init?: InternalRequestInit
  ): boolean {
    const ignoreUrls = this.config.ignoreUrls ?? [];
    if (init?.opentelemetry?.ignore !== undefined) {
      return init.opentelemetry.ignore;
    }
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
  }

  private shouldPropagate(
    url: URL,
    init?: InternalRequestInit
  ): boolean {
    const host =
      process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || null;
    const branchHost =
      process.env.VERCEL_BRANCH_URL ||
      process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ||
      null;
    const propagateContextUrls = this.config.propagateContextUrls ?? [];
    const dontPropagateContextUrls = this.config.dontPropagateContextUrls ?? [];
    if (init?.opentelemetry?.propagateContext) {
      return init.opentelemetry.propagateContext;
    }
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

  private startSpan({ tracer, url, fetchType, method = "GET", name, attributes = {} }: { tracer: Tracer; url: URL; fetchType: 'http' | 'fetch'; method?: string; name?: string; attributes?: Attributes }): Span {

    const resourceNameTemplate = this.config.resourceNameTemplate;

    const attrs = {
      [SemanticAttributes.HTTP_METHOD]: method,
      [SemanticAttributes.HTTP_URL]: url.toString(),
      [SemanticAttributes.HTTP_HOST]: url.host,
      [SemanticAttributes.HTTP_SCHEME]: url.protocol.replace(":", ""),
      [SemanticAttributes.NET_PEER_NAME]: url.hostname,
      [SemanticAttributes.NET_PEER_PORT]: url.port,
    };

    const resourceName = resourceNameTemplate
      ? resolveTemplate(resourceNameTemplate, attrs)
      : removeSearch(url.toString());

    const spanName = name ?? `${fetchType} ${method} ${url.toString()}`;

    const parentContext = context.active();

    return tracer.startSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          ...attrs,
          "operation.name": `${fetchType}.${method}`,
          "resource.name": resourceName,
          ...attributes,
        },
      },
      parentContext
    );
  }

  instrumentHttp(httpModule: Http | Https, protocolFromModule: 'https:' | 'http:'): void {
    const { tracerProvider } = this;
    if (!tracerProvider) {
      return;
    }

    const tracer = tracerProvider.getTracer(
      this.instrumentationName,
      this.instrumentationVersion
    );

    const { attributesFromRequestHeaders, attributesFromResponseHeaders } =
      this.config;

    const originalRequest = httpModule.request;
    const originalGet = httpModule.get;

    const instrumentRequest = (original: typeof httpModule.request) => {
      return (urlOrOptions: string | URL | RequestOptions, optionsOrCallback?: RequestOptions | Callback, optionalCallback?: Callback) => {
        let url: URL;
        let options: RequestOptions = {};
        let callback: Callback | undefined;

        // Parse arguments based on overload signatures
        if (typeof urlOrOptions === "string" || urlOrOptions instanceof URL) {
          // url[, options][, callback] signature
          url = new URL(urlOrOptions.toString());

          if (typeof optionsOrCallback === "function") {
            // url, callback
            callback = optionsOrCallback;
          } else if (optionsOrCallback && typeof optionalCallback === "function") {
            // url, options, callback
            options = optionsOrCallback;
            callback = optionalCallback;
          } else if (optionsOrCallback) {
            // url, options
            options = optionsOrCallback;
          }
        } else {
          // options[, callback] signature
          options = urlOrOptions;
          if (typeof optionsOrCallback === "function") {
            callback = optionsOrCallback;
          }

          // Construct URL from options
          const protocol = options.protocol || protocolFromModule;
          const host = options.host || options.hostname || "localhost";
          const path = options.path || "/";
          url = new URL(`${protocol}//${host}${path}`);
        }

        if (this.shouldIgnore(url)) {
          return original.apply(this, [url, options, callback]);
        }

        const span = this.startSpan({
          tracer,
          url,
          fetchType: 'http',
          method: options.method || "GET"
        });

        if (!span.isRecording() || !isSampled(span.spanContext().traceFlags)) {
          span.end();
          return original.apply(this, [url, options, callback]);
        }

        if (this.shouldPropagate(url)) {
          const parentContext = context.active();
          const httpContext = traceApi.setSpan(parentContext, span);
          propagation.inject(httpContext, options.headers || {}, HTTP_HEADERS_SETTER);
        }

        if (attributesFromRequestHeaders) {
          headersToAttributes(span, attributesFromRequestHeaders, new Headers(convertHeaders(options.headers)));
        }

        try {
          const startTime = Date.now();
          const req = original.apply(this, [url, options, callback]);

          req.prependListener('response', (res: IncomingMessage & { aborted?: boolean }) => {
            const duration = Date.now() - startTime;
            span.setAttribute("http.response_time", duration);

            if (res.statusCode !== undefined) {
              span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, res.statusCode);
              if (res.statusCode >= 500) {
                onError(span, `Status: ${res.statusCode}`);
              }
            } else {
              onError(span, "Response status code is undefined");
            }

            if (attributesFromResponseHeaders) {
              headersToAttributes(span, attributesFromResponseHeaders, convertHeaders(res.headers));
            }

            if (req.listenerCount('response') <= 1) {
              res.resume();
            }

            res.on("end", () => {
              let status: SpanStatus;
              const statusCode = res.statusCode;
              if (res.aborted && !res.complete) {
                status = { code: SpanStatusCode.ERROR };
              } else if (statusCode && statusCode >= 100 && statusCode < 500) {
                status = { code: SpanStatusCode.UNSET };
              } else {
                status = { code: SpanStatusCode.ERROR };
              }
              span.setStatus(status);
              if (span.isRecording() && res.headers["content-length"]) {
                span.setAttribute(
                  SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED,
                  res.headers["content-length"]
                );
                span.end();
              }
            });
          });

          req.on("error", (err: unknown) => {
            if (span.isRecording()) {
              onError(span, err);
              span.end();
            }
          });

          req.on('close', () => {
            if (span.isRecording()) {
              span.end();
            }
          });


          return req;
        } catch (err) {
          onError(span, err);
          span.end();
          throw err;
        }
      };
    };

    httpModule.request = instrumentRequest(originalRequest);
    httpModule.get = instrumentRequest(originalGet);
  }

  instrumentFetch(): void {
    const { tracerProvider } = this;
    if (!tracerProvider) {
      return;
    }

    const tracer = tracerProvider.getTracer(
      this.instrumentationName,
      this.instrumentationVersion
    );

    const { attributesFromRequestHeaders, attributesFromResponseHeaders } =
      this.config;

    // Disable fetch tracing in Next.js.
    process.env.NEXT_OTEL_FETCH_DISABLED = "1";

    const originalFetch = globalThis.fetch;
    this.originalFetch = originalFetch;

    const doFetch: typeof fetch = async (input, initArg) => {
      const init = initArg as InternalRequestInit | undefined;

      // Passthrough internal requests.
      if (init?.next?.internal) {
        return originalFetch(input, init);
      }

      const req = new Request(
        // The input Request must be cloned to avoid the bug
        // on Edge runtime where the `new Request()` eagerly
        // consumes the body of the original Request.
        input instanceof Request ? input.clone() : input,
        init
      );
      const url = new URL(req.url);
      if (this.shouldIgnore(url, init)) {
        return originalFetch(input, init);
      }

      const span = this.startSpan({
        tracer,
        url,
        fetchType: 'fetch',
        method: req.method,
        name: init?.opentelemetry?.spanName,
        attributes: init?.opentelemetry?.attributes,
      });

      if (!span.isRecording() || !isSampled(span.spanContext().traceFlags)) {
        span.end();
        return originalFetch(input, init);
      }

      if (this.shouldPropagate(url, init)) {
        const parentContext = context.active();
        const fetchContext = traceApi.setSpan(parentContext, span);
        propagation.inject(fetchContext, req.headers, FETCH_HEADERS_SETTER);
      }

      if (attributesFromRequestHeaders) {
        headersToAttributes(span, attributesFromRequestHeaders, req.headers);
      }

      try {
        const startTime = Date.now();
        // Remove "content-type" for a FormData body because undici regenerates
        // a new multipart separator each time.
        if (init?.body && init.body instanceof FormData) {
          req.headers.delete("content-type");
        }
        const res = await originalFetch(input, {
          ...init,
          headers: req.headers,
        });
        const duration = Date.now() - startTime;
        span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, res.status);
        span.setAttribute("http.response_time", duration);
        if (attributesFromResponseHeaders) {
          headersToAttributes(span, attributesFromResponseHeaders, res.headers);
        }
        if (res.status >= 500) {
          onError(span, `Status: ${res.status} (${res.statusText})`);
        }

        // Flush body, but non-blocking.
        if (res.body) {
          void pipeResponse(res).then(
            (byteLength) => {
              if (span.isRecording()) {
                span.setAttribute(
                  SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED,
                  byteLength
                );
                span.end();
              }
            },
            (err) => {
              if (span.isRecording()) {
                onError(span, err);
                span.end();
              }
            }
          );
        } else {
          span.end();
        }

        return res;
      } catch (e) {
        onError(span, e);
        span.end();
        throw e;
      }
    };
    globalThis.fetch = doFetch;
  }

  public enable(): void {
    this.disable();

    this.instrumentFetch();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpModule = require('node:http') as Http;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpsModule = require('node:https') as Https;
      this.instrumentHttp(httpModule, 'http:');
      this.instrumentHttp(httpsModule, 'https:');
    } catch {
      // Must be a non-Node env. Ignore.
    }
  }

  public disable(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
  }
}

const FETCH_HEADERS_SETTER: TextMapSetter<Headers> = {
  set(carrier: Headers, key: string, value: string): void {
    carrier.set(key, value);
  },
};

const HTTP_HEADERS_SETTER: TextMapSetter<IncomingHttpHeaders> = {
  set(carrier: IncomingHttpHeaders, key: string, value: string): void {
    // Convert to lower case to match Node.js behavior.
    carrier[key.toLowerCase()] = value;
  },
};

function removeSearch(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.substring(0, index);
}

function pipeResponse(res: Response): Promise<number> {
  let length = 0;
  const clone = res.clone();
  const reader = clone.body?.getReader();
  if (!reader) {
    return Promise.resolve(0);
  }
  const read = (): Promise<void> => {
    return reader.read().then(({ done, value }) => {
      if (done) {
        return;
      }
      length += value.byteLength;
      return read();
    });
  };
  return read().then(() => length);
}

function onError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  } else {
    const message = String(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message,
    });
  }
}

function headersToAttributes(
  span: Span,
  attrsToHeadersMap: Record<string, string>,
  headers: Headers
): void {
  for (const [attrName, headerName] of Object.entries(attrsToHeadersMap)) {
    const headerValue = headers.get(headerName);
    if (headerValue !== null) {
      span.setAttribute(attrName, headerValue);
    }
  }
}

function convertHeaders(incomingHeaders: IncomingHttpHeaders | OutgoingHttpHeaders | undefined): Headers {
  const headers = new Headers();
  if (!incomingHeaders) {
    return headers;
  }
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) {
      headers.append(key, value.join(", "));
    } else if (value !== undefined) {
      headers.append(key, value.toString());
    }
  }
  return headers;
}