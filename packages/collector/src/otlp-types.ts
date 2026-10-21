/**
 * Decimal-nanosecond string from the wire. A number is already milliseconds,
 * for hand-built fixtures.
 */
export type UnixNano = string | number;

export interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: number;
  doubleValue?: number;
  arrayValue?: { values: AnyValue[] };
  kvlistValue?: { values: KeyValue[] };
}

export interface KeyValue {
  key: string;
  value: AnyValue;
}

export interface Resource {
  attributes: KeyValue[];
  droppedAttributesCount?: number;
}

export interface InstrumentationScope {
  name: string;
  version?: string;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: UnixNano;
  endTimeUnixNano: UnixNano;
  attributes: KeyValue[];
  events: { name: string; timeUnixNano: UnixNano; attributes: KeyValue[] }[];
  links?: { traceId: string; spanId: string; attributes: KeyValue[] }[];
  status: { code: number; message?: string };
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  droppedLinksCount?: number;
}

export interface ScopeSpans {
  scope?: InstrumentationScope;
  spans?: Span[];
}

export interface ResourceSpans {
  resource?: Resource;
  scopeSpans: ScopeSpans[];
}

export interface ExportTraceServiceRequest {
  resourceSpans?: ResourceSpans[];
}
