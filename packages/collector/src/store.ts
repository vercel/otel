/**
 * Implements a trivial OpenTelemetry collector.
 * See https://opentelemetry.io/docs/.
 */

import type {
  Fixed64,
  Resource,
} from "@opentelemetry/otlp-transformer/build/src/common/internal-types";
import type {
  IResourceSpans,
  ISpan,
} from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import type { IHandler } from "./server";

type ISpanWithService = ISpan & { serviceName: string };

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

export function processResourceSpans(resourceSpans: IResourceSpans[]): void {
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
        const { traceId: traceIdRaw, parentSpanId, name, attributes } = span;
        const traceId = normalizeId(traceIdRaw);
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
      if (req.headers["content-type"] !== "application/json") {
        res.statusCode = 400;
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

      const json = JSON.parse(body.toString("utf-8")) as {
        resourceSpans?: IResourceSpans[];
      };
      const resourceSpans = json.resourceSpans ?? [];
      processResourceSpans(resourceSpans);
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

function isValidSpan(span: ISpan): boolean {
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

/**
 * Defines High-Resolution Time.
 *
 * The first number, HrTime[0], is UNIX Epoch time in seconds since 00:00:00 UTC on 1 January 1970.
 * The second number, HrTime[1], represents the partial second elapsed since Unix Epoch time represented by first number in nanoseconds.
 * For example, 2021-01-01T12:30:10.150Z in UNIX Epoch time in milliseconds is represented as 1609504210150.
 * The first number is calculated by converting and truncating the Epoch time in milliseconds to seconds:
 * HrTime[0] = Math.trunc(1609504210150 / 1000) = 1609504210.
 * The second number is calculated by converting the digits after the decimal point of the subtraction, (1609504210150 / 1000) - HrTime[0], to nanoseconds:
 * HrTime[1] = Number((1609504210.150 - HrTime[0]).toFixed(9)) * 1e9 = 150000000.
 * This is represented in HrTime format as [1609504210, 150000000].
 */
function unixNanoToMillis(unixNano: Fixed64): number {
  if (typeof unixNano === "string") {
    return new Date(unixNano).getTime();
  }
  if (typeof unixNano === "number") {
    return unixNano;
  }
  if (typeof unixNano === "object") {
    const { low: seconds, high: nanos } = unixNano;
    return seconds * 1000 + nanos / 1e6;
  }
  return unixNano / 1e6;
}

function normalizeId(id: string | Uint8Array): string {
  if (typeof id === "string") {
    return id;
  }
  return Buffer.from(id).toString("hex");
}
