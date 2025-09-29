// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from "vitest";
import type { OtelCollector, ITrace } from "collector";
import type {
  AttributeValue,
  Attributes,
  SpanStatus,
} from "@opentelemetry/api";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { normalizeId } from "./normalize-id";

export interface TraceMatch {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: SpanKind;
  status?: SpanStatus;
  resource?: Attributes;
  attributes?: Attributes;
  links?: unknown[];
  events?: { name: string; attributes?: Attributes }[];
  spans?: TraceMatch[];
}

export async function expectTrace(
  collector: OtelCollector,
  tracesMatch: TraceMatch,
): Promise<void> {
  const numberOfSpans = countSpans(tracesMatch);

  const foundTrace = await Promise.race([
    new Promise<ITrace>((resolve) => {
      const interval = setInterval(() => {
        const traces = collector.getAllTraces();
        // console.log(
        //   "[expect-trace] traces:",
        //   traces.length,
        //   traces.map((t) => t.name)
        // );
        const matchedTrace = traces.find((trace) => {
          return (
            trace.name === tracesMatch.name &&
            trace.spans.length >= numberOfSpans
          );
        });
        if (matchedTrace) {
          clearInterval(interval);
          resolve(matchedTrace);
        }
      }, 50);
    }),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), 4000);
    }),
  ]);

  if (!foundTrace) {
    printTraces(collector);
    const traces = collector.getAllTraces();
    throw new Error(
      `trace not found: "${
        tracesMatch.name || ""
      }" (${numberOfSpans} spans). Available traces: (${
        traces.length
      }) [${traces
        .map((t) => `"${t.name}" (${t.spans.length} spans)`)
        .join(", ")}]`,
    );
  }

  const serviceMap = collector.getServiceMap();
  const resource = serviceMap[foundTrace.serviceName];
  const spansForMatching = [];
  for (let i = 0; i < foundTrace.spans.length; i++) {
    const span = foundTrace.spans[i]!;
    const spanForMatching: TraceMatch = {
      traceId: normalizeId(span.traceId),
      spanId: normalizeId(span.spanId),
      parentSpanId: span.parentSpanId
        ? normalizeId(span.parentSpanId)
        : undefined,
      name: span.name,
      kind: eSpanKindToSpanKind(span.kind),
      status: eStatusToStatus(span.status),
      attributes: eAttrsToAttrs(span.attributes),
      links: span.links,
      events: span.events.map((e) => ({
        name: e.name,
        attributes: eAttrsToAttrs(e.attributes),
      })),
      spans: [],
    };
    spansForMatching[i] = spanForMatching;
  }
  let root: TraceMatch | undefined;
  for (let i = 0; i < spansForMatching.length; i++) {
    const span = spansForMatching[i]!;
    const parentId = foundTrace.spans[i]!.parentSpanId;
    const parent = parentId
      ? spansForMatching.find((s) => s.spanId === parentId)
      : undefined;
    if (parent) {
      parent.spans?.push(span);
    } else {
      root = span;
      if (resource) {
        root.resource = eAttrsToAttrs(resource.attributes);
      }
    }
  }

  if (!root) {
    throw new Error("no root");
  }

  expect(root).toMatchObject(tracesMatch);
}

const countSpans = (traceMatch: TraceMatch): number => {
  let count = 1;
  if (traceMatch.spans) {
    for (const span of traceMatch.spans) {
      count += countSpans(span);
    }
  }
  return count;
};

const eSpanKindToSpanKind = (eKind: number): SpanKind => {
  switch (eKind) {
    case 1:
      return SpanKind.INTERNAL;
    case 2:
      return SpanKind.SERVER;
    case 3:
      return SpanKind.CLIENT;
    case 4:
      return SpanKind.PRODUCER;
    case 5:
      return SpanKind.CONSUMER;
    default:
      return SpanKind.INTERNAL;
  }
};

const eStatusCodeToStatusCode = (eCode: number): SpanStatusCode => {
  switch (eCode) {
    case 0:
      return SpanStatusCode.UNSET;
    case 1:
      return SpanStatusCode.OK;
    case 2:
      return SpanStatusCode.ERROR;
    default:
      return SpanStatusCode.UNSET;
  }
};

const eStatusToStatus = (
  eStatus: ITrace["spans"][number]["status"],
): SpanStatus => {
  const { code: eCode, message } = eStatus;
  return { code: eStatusCodeToStatusCode(eCode), message };
};

const eAttrValueToAttrValue = (
  value: ITrace["spans"][number]["attributes"][number]["value"],
): AttributeValue | null => {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.boolValue !== undefined) {
    return value.boolValue;
  }
  if (value.intValue !== undefined) {
    return value.intValue;
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.arrayValue !== undefined) {
    return value.arrayValue.values
      .map(eAttrValueToAttrValue)
      .filter((x) => x !== null) as AttributeValue;
  }
  return null;
};

const eAttrsToAttrs = (
  attrs: ITrace["spans"][number]["attributes"],
): Attributes => {
  const result: Attributes = {};
  for (const { key, value } of attrs) {
    const conv = eAttrValueToAttrValue(value);
    if (conv !== null) {
      result[key] = conv;
    }
  }
  return result;
};

/* eslint-disable no-console */
export function printTraces(collector: OtelCollector): void {
  const serviceMap = collector.getServiceMap();
  const traces = collector.getAllTraces();
  for (const trace of traces) {
    console.log(">> trace:", trace.name, trace.serviceName, trace.traceId);
    console.log(
      ">>>> resource:",
      serviceMap[trace.serviceName]!.attributes.map(({ key, value }) => ({
        key,
        value: JSON.stringify(value),
      })),
    );
    for (const span of trace.spans) {
      console.log("  span:", span.name);
    }
  }
}
/* eslint-enable no-console */
