import { afterEach, describe, expect, it } from "vitest";
import {
  ROOT_CONTEXT,
  context,
  defaultTextMapGetter,
  propagation,
  trace,
} from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Configuration } from "./types";
import { Sdk } from "./sdk";

describe("Sdk propagators", () => {
  let sdk: Sdk | undefined;

  afterEach(async () => {
    await sdk?.shutdown();
    sdk = undefined;
    propagation.disable();
    trace.disable();
    context.disable();
  });

  function extractedBaggageEntries(
    propagators: Configuration["propagators"],
    header: string,
  ): number {
    sdk = new Sdk({ propagators, instrumentations: [], spanProcessors: [] });
    sdk.start();
    const extracted = propagation.extract(
      ROOT_CONTEXT,
      { baggage: header },
      defaultTextMapGetter,
    );
    return propagation.getBaggage(extracted)?.getAllEntries().length ?? 0;
  }

  const oversizedHeader = Array.from(
    { length: 5000 },
    (_, i) => `k${i}=v`,
  ).join(",");

  it.each([["auto"], ["baggage"]] as const)(
    "limits inbound baggage entries with the %s propagator",
    (propagator) => {
      expect(extractedBaggageEntries([propagator], oversizedHeader)).toBe(180);
    },
  );
});

describe("Sdk span processors", () => {
  let sdk: Sdk | undefined;

  afterEach(async () => {
    await sdk?.shutdown();
    sdk = undefined;
    propagation.disable();
    trace.disable();
    context.disable();
  });

  it("lets a configured processor's onEnding change attributes before export", () => {
    const redactor: SpanProcessor = {
      onStart: () => undefined,
      onEnding(span) {
        span.setAttribute("secret", "[redacted]");
      },
      onEnd: () => undefined,
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    const exporter = new InMemorySpanExporter();
    sdk = new Sdk({
      instrumentations: [],
      spanProcessors: [redactor, new SimpleSpanProcessor(exporter)],
    });
    sdk.start();
    const span = trace.getTracer("test").startSpan("op");
    span.setAttribute("secret", "hunter2");
    span.end();
    expect(exporter.getFinishedSpans()[0]?.attributes.secret).toBe(
      "[redacted]",
    );
  });
});
