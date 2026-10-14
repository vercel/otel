import { describe, expect, it } from "vitest";
import type { Span } from "@opentelemetry/api";
import { ROOT_CONTEXT, TraceFlags, trace } from "@opentelemetry/api";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { CompositeSpanProcessor } from "./composite-span-processor";

const tracer = new BasicTracerProvider({
  spanProcessors: [new CompositeSpanProcessor([], undefined)],
}).getTracer("test");

// Every request continuing the trace receives the same `traceparent`.
const incomingTraceparent = trace.setSpanContext(ROOT_CONTEXT, {
  traceId: "d4cda95b652f4a1592b449d5929fda1b",
  spanId: "6e0c63257de34c92",
  traceFlags: TraceFlags.SAMPLED,
  isRemote: true,
});

const startRequest = (name: string): Span =>
  tracer.startSpan(name, {}, incomingTraceparent);
const startChild = (name: string, parent: Span): Span =>
  tracer.startSpan(name, {}, trace.setSpan(ROOT_CONTEXT, parent));

describe("CompositeSpanProcessor", () => {
  it("ends a request's open spans when its root span ends", () => {
    const root = startRequest("request");
    const child = startChild("child", root);
    const grandchild = startChild("grandchild", child);

    root.end();

    expect(child.isRecording()).toBe(false);
    expect(grandchild.isRecording()).toBe(false);
  });

  it("does not end another request's spans when two requests share a trace", () => {
    const rootA = startRequest("request A");
    const rootB = startRequest("request B");
    const childB = startChild("child B", rootB);

    rootA.end();

    expect(rootB.isRecording()).toBe(true);
    expect(childB.isRecording()).toBe(true);

    rootB.end();

    expect(childB.isRecording()).toBe(false);
  });
});
