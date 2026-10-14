import { afterEach, describe, expect, it } from "vitest";
import type { Span } from "@opentelemetry/api";
import { ROOT_CONTEXT, TraceFlags, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { CompositeSpanProcessor } from "./composite-span-processor";

const exporter = new InMemorySpanExporter();
const tracer = new BasicTracerProvider({
  spanProcessors: [
    new CompositeSpanProcessor([new SimpleSpanProcessor(exporter)], undefined),
  ],
}).getTracer("test");

const requestContextSymbol = Symbol.for("@vercel/request-context");
const globalWithRequestContext = globalThis as {
  [requestContextSymbol]?: unknown;
};

afterEach(() => {
  exporter.reset();
  globalWithRequestContext[requestContextSymbol] = undefined;
});

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

  it("gives each request that shares a trace its own request attributes and waitUntil", () => {
    let current:
      | { headers: Record<string, string>; waitUntil: () => void }
      | undefined;
    globalWithRequestContext[requestContextSymbol] = {
      get: (): typeof current => current,
    };
    const waitUntilCalls = { "req-a": 0, "req-b": 0 };
    const startWithContext = (id: "req-a" | "req-b"): Span => {
      current = {
        headers: { "x-vercel-id": `iad1::${id}` },
        waitUntil: (): void => {
          waitUntilCalls[id] += 1;
        },
      };
      return startRequest(id);
    };

    const rootA = startWithContext("req-a");
    const rootB = startWithContext("req-b");
    rootA.end();
    rootB.end();

    const exported = exporter.getFinishedSpans();
    const requestId = (name: string): unknown =>
      exported.find((span) => span.name === name)?.attributes[
        "vercel.request_id"
      ];
    expect(requestId("req-a")).toBe("req-a");
    expect(requestId("req-b")).toBe("req-b");
    expect(waitUntilCalls).toEqual({ "req-a": 1, "req-b": 1 });
  });

  it("does not end a late child's span when a sibling started after the request ended", () => {
    const request = startRequest("request");
    request.end();
    const lookup = startChild("lookup", request);
    const connect = startChild("connect", request);

    lookup.end();

    expect(connect.isRecording()).toBe(true);
  });
});
