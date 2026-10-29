import path from "node:path";
import { fileURLToPath } from "node:url";
import { Root, type Type } from "protobufjs";
import type {
  AnyValue,
  ExportTraceServiceRequest,
  KeyValue,
  ResourceSpans,
  Span,
  UnixNano,
} from "./otlp-types";

const PROTO_ROOT = fileURLToPath(new URL("../proto/", import.meta.url));
const REQUEST_TYPE =
  "opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest";

let requestType: Type | undefined;

interface RawAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: RawAnyValue[] };
  kvlistValue?: { values?: RawKeyValue[] };
}

interface RawKeyValue {
  key?: string;
  value?: RawAnyValue;
}

interface RawSpan {
  traceId?: unknown;
  spanId?: unknown;
  parentSpanId?: unknown;
  name?: string;
  kind?: number;
  startTimeUnixNano?: unknown;
  endTimeUnixNano?: unknown;
  attributes?: RawKeyValue[];
  events?: {
    name?: string;
    timeUnixNano?: unknown;
    attributes?: RawKeyValue[];
  }[];
  links?: {
    traceId?: unknown;
    spanId?: unknown;
    attributes?: RawKeyValue[];
  }[];
  status?: { code?: number; message?: string };
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  droppedLinksCount?: number;
}

interface RawRequest {
  resourceSpans?: {
    resource?: {
      attributes?: RawKeyValue[];
      droppedAttributesCount?: number;
    };
    scopeSpans?: {
      scope?: { name?: string; version?: string };
      spans?: RawSpan[];
    }[];
  }[];
}

export function decodeTraceRequest(body: Uint8Array): ExportTraceServiceRequest {
  const type = loadRequestType();
  const raw = type.toObject(type.decode(body), {
    longs: String,
    enums: Number,
    arrays: true,
  }) as RawRequest;
  return { resourceSpans: (raw.resourceSpans ?? []).map(normalizeResourceSpans) };
}

function loadRequestType(): Type {
  if (requestType) {
    return requestType;
  }
  const root = new Root();
  root.resolvePath = (_origin: string, target: string): string =>
    path.isAbsolute(target) ? target : path.join(PROTO_ROOT, target);
  root.loadSync(
    path.join(
      PROTO_ROOT,
      "opentelemetry/proto/collector/trace/v1/trace_service.proto",
    ),
  );
  requestType = root.lookupType(REQUEST_TYPE);
  return requestType;
}

function normalizeResourceSpans(
  resourceSpans: NonNullable<RawRequest["resourceSpans"]>[number],
): ResourceSpans {
  return {
    resource: resourceSpans.resource
      ? {
          attributes: (resourceSpans.resource.attributes ?? []).map(
            normalizeKeyValue,
          ),
          droppedAttributesCount: resourceSpans.resource.droppedAttributesCount,
        }
      : undefined,
    scopeSpans: (resourceSpans.scopeSpans ?? []).map((scopeSpans) => ({
      scope: scopeSpans.scope?.name
        ? {
            name: scopeSpans.scope.name,
            version: scopeSpans.scope.version,
          }
        : undefined,
      spans: (scopeSpans.spans ?? []).map(normalizeSpan),
    })),
  };
}

function normalizeSpan(span: RawSpan): Span {
  const parentSpanId = bytesToHex(span.parentSpanId);
  return {
    traceId: bytesToHex(span.traceId) ?? "",
    spanId: bytesToHex(span.spanId) ?? "",
    ...(parentSpanId ? { parentSpanId } : {}),
    name: span.name ?? "",
    kind: span.kind ?? 0,
    startTimeUnixNano: asUnixNano(span.startTimeUnixNano),
    endTimeUnixNano: asUnixNano(span.endTimeUnixNano),
    attributes: (span.attributes ?? []).map(normalizeKeyValue),
    events: (span.events ?? []).map((event) => ({
      name: event.name ?? "",
      timeUnixNano: asUnixNano(event.timeUnixNano),
      attributes: (event.attributes ?? []).map(normalizeKeyValue),
    })),
    links: (span.links ?? []).map((link) => ({
      traceId: bytesToHex(link.traceId) ?? "",
      spanId: bytesToHex(link.spanId) ?? "",
      attributes: (link.attributes ?? []).map(normalizeKeyValue),
    })),
    status: {
      code: span.status?.code ?? 0,
      message: span.status?.message,
    },
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

function normalizeKeyValue(entry: RawKeyValue): KeyValue {
  return {
    key: entry.key ?? "",
    value: normalizeAnyValue(entry.value),
  };
}

function normalizeAnyValue(value: RawAnyValue | undefined): AnyValue {
  if (!value) {
    return {};
  }
  const out: AnyValue = {};
  if (value.stringValue !== undefined) {
    out.stringValue = value.stringValue;
  }
  if (value.boolValue !== undefined) {
    out.boolValue = value.boolValue;
  }
  if (value.intValue !== undefined) {
    out.intValue = Number(value.intValue);
  }
  if (value.doubleValue !== undefined) {
    out.doubleValue = value.doubleValue;
  }
  if (value.arrayValue?.values) {
    out.arrayValue = {
      values: value.arrayValue.values.map(normalizeAnyValue),
    };
  }
  if (value.kvlistValue?.values) {
    out.kvlistValue = {
      values: value.kvlistValue.values.map(normalizeKeyValue),
    };
  }
  return out;
}

function asUnixNano(value: unknown): UnixNano {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return "0";
}

function bytesToHex(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.length === 0 ? undefined : value;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return value.length === 0 ? undefined : Buffer.from(value).toString("hex");
  }
  return undefined;
}
