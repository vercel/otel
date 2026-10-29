/**
 * Implements a trivial OpenTelemetry collector.
 * See https://opentelemetry.io/docs/.
 */

import type {
  ExportTraceServiceRequest,
  Resource,
  ResourceSpans,
  Span,
  UnixNano,
} from "./otlp-types";
import { decodeTraceRequest } from "./otlp-proto";
import type { IHandler } from "./server";

type ISpanWithService = Span & { serviceName: string };

// eslint-disable-next-line @typescript-eslint/naming-convention -- For consistency with the OTLP types.
export interface ITrace {
  index: number;
  traceId: string;
  name: string;
  serviceName: string;
  spans: ISpanWithService[];
  timestamp: number;
}

interface Store {
  services: Record<string, Resource>;
  traces: ITrace[];
}

const skipSet = new Set([
  "build component tree",
  "resolve page components",
  "resolve segment modules",
  "start response",
  "NextNodeServer.clientComponentLoading",
]);

const store: Store = {
  services: {},
  traces: [],
};

let traceIndex = 0;
const MAX_TRACES = 1000;
const DEBUG = false;

export function resetStore(): void {
  store.services = {};
  store.traces = [];
}

export function processResourceSpans(resourceSpans: ResourceSpans[]): void {
  for (const resourceSpan of resourceSpans) {
    const { resource } = resourceSpan;
    if (!resource) {
      continue;
    }
    const serviceNameRaw = resource.attributes.find(
      ({ key }) => key === "service.name",
    )?.value.stringValue;
    if (!serviceNameRaw) {
      continue;
    }
    const runtimeName = resource.attributes.find(
      ({ key }) => key === "runtime.name" || key === "vercel.runtime",
    )?.value.stringValue;
    const serviceName = `${serviceNameRaw}${
      runtimeName ? `:${runtimeName}` : ""
    }`;
    if (!store.services[serviceName]) {
      store.services[serviceName] = resource;
    }
    for (const scopeSpan of resourceSpan.scopeSpans) {
      const scope = scopeSpan.scope;
      for (const span of scopeSpan.spans ?? []) {
        if (!isValidSpan(span)) {
          continue;
        }
        const { traceId, parentSpanId, name, attributes } = span;
        let trace = store.traces.find((t) => t.traceId === traceId);
        if (!trace) {
          trace = {
            index: ++traceIndex,
            traceId,
            serviceName: "",
            name: "",
            spans: [],
            timestamp: unixNanoToMillis(span.startTimeUnixNano),
          } satisfies ITrace;
          store.traces.push(trace);
        }
        trace.spans.push({
          ...span,
          serviceName,
          attributes: scope
            ? [
                {
                  key: "scope",
                  value: {
                    stringValue: scope.name,
                  },
                },
                {
                  key: "runtime.name",
                  value: {
                    stringValue: runtimeName,
                  },
                },
                ...attributes,
              ]
            : attributes,
        });

        const spans = trace.spans;
        const rootSpan = spans.find((s) => {
          if (!s.parentSpanId) {
            return true;
          }
          if (!spans.some((s2) => s2.spanId === s.parentSpanId)) {
            return true;
          }
          return false;
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            "COLLECTOR: span: ",
            name,
            span.traceId,
            span.spanId,
            parentSpanId,
            span.spanId === rootSpan?.spanId,
            rootSpan?.name,
          );
        }
        if (span.spanId === rootSpan?.spanId) {
          trace.serviceName = serviceName;
          trace.name = name;
          trace.timestamp = unixNanoToMillis(span.startTimeUnixNano);
        }
      }
    }
  }
  if (store.traces.length > MAX_TRACES) {
    store.traces = store.traces.slice(store.traces.length - MAX_TRACES);
  }
}

export function getServiceNames(): string[] {
  return Object.keys(store.services);
}

export function getServiceMap(): Record<string, Resource> {
  return { ...store.services } as Record<string, Resource>;
}

export function getTraceCount(): number {
  return store.traces.length;
}

export function getAllTraces(): ITrace[] {
  return store.traces.slice(0);
}

export function getTraceById(traceId: string): ITrace | undefined {
  return store.traces.find((t) => t.traceId === traceId);
}

export function findTraces({
  traceIds,
  serviceName,
  start,
  end,
}: {
  traceIds?: string[];
  serviceName?: string;
  start?: number;
  end?: number;
}): ITrace[] {
  let traces = store.traces.slice(0);

  if (traceIds) {
    traces = traces.filter((t) => traceIds.includes(t.traceId));
  }

  if (serviceName && serviceName !== "all") {
    traces = traces.filter((t) => t.serviceName === serviceName);
  }

  if (start) {
    traces = traces.filter((t) => t.timestamp >= start);
  }
  if (end) {
    traces = traces.filter((t) => t.timestamp <= end);
  }
  return traces;
}

export function createCollectorHandlers(): IHandler[] {
  return [createCollectorTraceHandler(), createCollectorGetTraceHandler()];
}

function createCollectorTraceHandler(): IHandler {
  return async (req, res) => {
    if (req.url === "/v1/traces") {
      // Allow CORS.
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, GET, OPTIONS, DELETE",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "content-type, accept, otel-encoding",
      );
      res.setHeader("Access-Control-Max-Age", "86400");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }

      const body = await new Promise<Buffer>((resolve, reject) => {
        const acc: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          acc.push(chunk);
        });
        req.on("end", () => {
          resolve(Buffer.concat(acc));
        });
        req.on("error", reject);
      });

      const request = parseTraceRequest(req.headers["content-type"], body);
      if (!request) {
        res.statusCode = 415;
        res.end();
        return;
      }
      processResourceSpans(request.resourceSpans ?? []);
      res.statusCode = 202;
      res.end();
    }
  };
}

function createCollectorGetTraceHandler(): IHandler {
  return (req, res) => {
    if (req.url?.startsWith("/trace/")) {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.end();
        return;
      }

      const traceId = req.url.slice("/trace/".length);
      const trace = getTraceById(traceId);
      if (!trace) {
        res.statusCode = 404;
        res.end();
        return;
      }

      res.setHeader("content-type", "application/json");
      res.write(JSON.stringify(trace, null, 2));
      res.end();
    }
  };
}

function isValidSpan(span: Span): boolean {
  const { attributes } = span;
  const hasBubble = attributes.some(
    ({ key, value }) => key === "next.bubble" && value.boolValue === true,
  );
  if (hasBubble) {
    return false;
  }
  if (skipSet.has(span.name)) {
    return false;
  }
  return true;
}

function unixNanoToMillis(unixNano: UnixNano | undefined): number {
  if (typeof unixNano === "number") {
    return unixNano;
  }
  if (unixNano === undefined) {
    return 0;
  }
  if (/^\d+$/.test(unixNano)) {
    return Number(BigInt(unixNano) / 1_000_000n);
  }
  const parsed = Date.parse(unixNano);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseTraceRequest(
  contentType: string | string[] | undefined,
  body: Buffer,
): ExportTraceServiceRequest | undefined {
  const type = Array.isArray(contentType) ? contentType[0] : contentType;
  switch (type) {
    case "application/json":
      return JSON.parse(body.toString("utf-8")) as ExportTraceServiceRequest;
    case "application/x-protobuf":
      return decodeTraceRequest(body);
    default:
      return undefined;
  }
}
