/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable camelcase */
/* eslint-disable eqeqeq */

/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable import/no-extraneous-dependencies */

/**
 * This file is constructed by:
 *
 * 1. Clone https://github.com/open-telemetry/opentelemetry-js.git
 * 2. Run `protos:generate` in `experimental/packages/otlp-proto-exporter-base/`
 * 3. Fork `experimental/packages/otlp-proto-exporter-base/src/generated/root.js` and inline all encode methods. Throw away the rest of the code.
 *
 * The OTLP protocol is very stable, so these steps would only need to be done rarely.
 */

import type {
  IAnyValue,
  IArrayValue,
  IEvent,
  IExportTraceServiceRequest,
  IInstrumentationScope,
  IKeyValue,
  IKeyValueList,
  ILink,
  IResource,
  IResourceSpans,
  IScopeSpans,
  ISpan,
  IStatus,
} from "@opentelemetry/otlp-transformer";
import type { Long } from "protobufjs/minimal";
import { Writer } from "protobufjs/minimal";

export function encodeTraceServiceRequest(
  message: IExportTraceServiceRequest
): Uint8Array {
  const writer = new Writer();
  ExportTraceServiceRequest_encode(message, writer);
  return writer.finish();
}

export function ExportTraceServiceRequest_encode(
  message: IExportTraceServiceRequest,
  writer: Writer
): Writer {
  if (message.resourceSpans != null && message.resourceSpans.length)
    for (let i = 0; i < message.resourceSpans.length; ++i)
      ResourceSpans_encode(
        message.resourceSpans[i]!,
        writer.uint32(/* id 1, wireType 2 =*/ 10).fork()
      ).ldelim();
  return writer;
}

function ResourceSpans_encode(message: IResourceSpans, writer: Writer): Writer {
  if (message.resource != null)
    Resource_encode(
      message.resource,
      writer.uint32(/* id 1, wireType 2 =*/ 10).fork()
    ).ldelim();
  if (message.scopeSpans != null && message.scopeSpans.length)
    for (let i = 0; i < message.scopeSpans.length; ++i)
      ScopeSpans_encode(
        message.scopeSpans[i]!,
        writer.uint32(/* id 2, wireType 2 =*/ 18).fork()
      ).ldelim();
  if (message.schemaUrl != null)
    writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.schemaUrl);
  return writer;
}

function Resource_encode(message: IResource, writer: Writer): Writer {
  if (message.attributes != null && message.attributes.length)
    for (let i = 0; i < message.attributes.length; ++i)
      KeyValue_encode(
        message.attributes[i]!,
        writer.uint32(/* id 1, wireType 2 =*/ 10).fork()
      ).ldelim();
  if (message.droppedAttributesCount != null)
    writer
      .uint32(/* id 2, wireType 0 =*/ 16)
      .uint32(message.droppedAttributesCount);
  return writer;
}

function ScopeSpans_encode(message: IScopeSpans, writer: Writer): Writer {
  if (message.scope != null)
    InstrumentationScope_encode(
      message.scope,
      writer.uint32(/* id 1, wireType 2 =*/ 10).fork()
    ).ldelim();
  if (message.spans != null && message.spans.length)
    for (let i = 0; i < message.spans.length; ++i)
      Span_encode(
        message.spans[i]!,
        writer.uint32(/* id 2, wireType 2 =*/ 18).fork()
      ).ldelim();
  if (message.schemaUrl != null)
    writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.schemaUrl);
  return writer;
}

function KeyValue_encode(message: IKeyValue, writer: Writer): Writer {
  if (message.key != null)
    writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.key);
  if (message.value != null)
    AnyValue_encode(
      message.value,
      writer.uint32(/* id 2, wireType 2 =*/ 18).fork()
    ).ldelim();
  return writer;
}

function AnyValue_encode(message: IAnyValue, writer: Writer): Writer {
  if (message.stringValue != null)
    writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.stringValue);
  if (message.boolValue != null)
    writer.uint32(/* id 2, wireType 0 =*/ 16).bool(message.boolValue);
  if (message.intValue != null)
    writer.uint32(/* id 3, wireType 0 =*/ 24).int64(message.intValue);
  if (message.doubleValue != null)
    writer.uint32(/* id 4, wireType 1 =*/ 33).double(message.doubleValue);
  if (message.arrayValue != null)
    ArrayValue_encode(
      message.arrayValue,
      writer.uint32(/* id 5, wireType 2 =*/ 42).fork()
    ).ldelim();
  if (message.kvlistValue != null)
    KeyValueList_encode(
      message.kvlistValue,
      writer.uint32(/* id 6, wireType 2 =*/ 50).fork()
    ).ldelim();
  if (message.bytesValue != null)
    writer.uint32(/* id 7, wireType 2 =*/ 58).bytes(message.bytesValue);
  return writer;
}

function ArrayValue_encode(message: IArrayValue, writer: Writer): Writer {
  if (message.values != null && message.values.length)
    for (let i = 0; i < message.values.length; ++i)
      AnyValue_encode(
        message.values[i]!,
        writer.uint32(/* id 1, wireType 2 =*/ 10).fork()
      ).ldelim();
  return writer;
}

function KeyValueList_encode(message: IKeyValueList, writer: Writer): Writer {
  if (message.values != null && message.values.length)
    for (let i = 0; i < message.values.length; ++i)
      KeyValue_encode(
        message.values[i]!,
        writer.uint32(/* id 1, wireType 2 =*/ 10).fork()
      ).ldelim();
  return writer;
}

function InstrumentationScope_encode(
  message: IInstrumentationScope,
  writer: Writer
): Writer {
  if (message.name != null)
    writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
  if (message.version != null)
    writer.uint32(/* id 2, wireType 2 =*/ 18).string(message.version);
  if (message.attributes != null && message.attributes.length)
    for (let i = 0; i < message.attributes.length; ++i)
      KeyValue_encode(
        message.attributes[i]!,
        writer.uint32(/* id 3, wireType 2 =*/ 26).fork()
      ).ldelim();
  if (message.droppedAttributesCount != null)
    writer
      .uint32(/* id 4, wireType 0 =*/ 32)
      .uint32(message.droppedAttributesCount);
  return writer;
}

function Span_encode(message: ISpan, writer: Writer): Writer {
  if (message.traceId != null)
    writer.uint32(/* id 1, wireType 2 =*/ 10).bytes(message.traceId);
  if (message.spanId != null)
    writer.uint32(/* id 2, wireType 2 =*/ 18).bytes(message.spanId);
  if (message.traceState != null)
    writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.traceState);
  if (message.parentSpanId != null)
    writer.uint32(/* id 4, wireType 2 =*/ 34).bytes(message.parentSpanId);
  if (message.name != null)
    writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.name);
  if (message.kind != null)
    writer.uint32(/* id 6, wireType 0 =*/ 48).int32(message.kind);
  if (message.startTimeUnixNano != null)
    writer
      .uint32(/* id 7, wireType 1 =*/ 57)
      .fixed64(message.startTimeUnixNano as Long);
  if (message.endTimeUnixNano != null)
    writer
      .uint32(/* id 8, wireType 1 =*/ 65)
      .fixed64(message.endTimeUnixNano as Long);
  if (message.attributes != null && message.attributes.length)
    for (let i = 0; i < message.attributes.length; ++i)
      KeyValue_encode(
        message.attributes[i]!,
        writer.uint32(/* id 9, wireType 2 =*/ 74).fork()
      ).ldelim();
  if (message.droppedAttributesCount != null)
    writer
      .uint32(/* id 10, wireType 0 =*/ 80)
      .uint32(message.droppedAttributesCount);
  if (message.events != null && message.events.length)
    for (let i = 0; i < message.events.length; ++i)
      Event_encode(
        message.events[i]!,
        writer.uint32(/* id 11, wireType 2 =*/ 90).fork()
      ).ldelim();
  if (message.droppedEventsCount != null)
    writer
      .uint32(/* id 12, wireType 0 =*/ 96)
      .uint32(message.droppedEventsCount);
  if (message.links != null && message.links.length)
    for (let i = 0; i < message.links.length; ++i)
      Link_encode(
        message.links[i]!,
        writer.uint32(/* id 13, wireType 2 =*/ 106).fork()
      ).ldelim();
  if (message.droppedLinksCount != null)
    writer
      .uint32(/* id 14, wireType 0 =*/ 112)
      .uint32(message.droppedLinksCount);
  if (message.status != null)
    Status_encode(
      message.status,
      writer.uint32(/* id 15, wireType 2 =*/ 122).fork()
    ).ldelim();
  return writer;
}

function Status_encode(message: IStatus, writer: Writer): Writer {
  if (message.message != null)
    writer.uint32(/* id 2, wireType 2 =*/ 18).string(message.message);
  if (message.code != null)
    writer.uint32(/* id 3, wireType 0 =*/ 24).int32(message.code);
  return writer;
}

function Event_encode(message: IEvent, writer: Writer): Writer {
  if (message.timeUnixNano != null)
    writer
      .uint32(/* id 1, wireType 1 =*/ 9)
      .fixed64(message.timeUnixNano as Long);
  if (message.name != null)
    writer.uint32(/* id 2, wireType 2 =*/ 18).string(message.name);
  if (message.attributes != null && message.attributes.length)
    for (let i = 0; i < message.attributes.length; ++i)
      KeyValue_encode(
        message.attributes[i]!,
        writer.uint32(/* id 3, wireType 2 =*/ 26).fork()
      ).ldelim();
  if (message.droppedAttributesCount != null)
    writer
      .uint32(/* id 4, wireType 0 =*/ 32)
      .uint32(message.droppedAttributesCount);
  return writer;
}

function Link_encode(message: ILink, writer: Writer): Writer {
  if (message.traceId != null)
    writer.uint32(/* id 1, wireType 2 =*/ 10).bytes(message.traceId);
  if (message.spanId != null)
    writer.uint32(/* id 2, wireType 2 =*/ 18).bytes(message.spanId);
  if (message.traceState != null)
    writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.traceState);
  if (message.attributes != null && message.attributes.length)
    for (let i = 0; i < message.attributes.length; ++i)
      KeyValue_encode(
        message.attributes[i]!,
        writer.uint32(/* id 4, wireType 2 =*/ 34).fork()
      ).ldelim();
  if (message.droppedAttributesCount != null)
    writer
      .uint32(/* id 5, wireType 0 =*/ 40)
      .uint32(message.droppedAttributesCount);
  return writer;
}
