import { describe, expect, it } from "vitest";
import type { TextMapGetter } from "@opentelemetry/api";
import { ROOT_CONTEXT, propagation } from "@opentelemetry/api";
// `sdk.ts` bundles this propagator for the `baggage` and `auto` propagator options.
import { W3CBaggagePropagator } from "@opentelemetry/core";

const getter: TextMapGetter<Record<string, string>> = {
  get: (carrier, key) => carrier[key],
  keys: (carrier) => Object.keys(carrier),
};

function extractEntries(header: string): number {
  const ctx = new W3CBaggagePropagator().extract(
    ROOT_CONTEXT,
    { baggage: header },
    getter,
  );
  return propagation.getBaggage(ctx)?.getAllEntries().length ?? 0;
}

describe("W3CBaggagePropagator (GHSA-8988-4f7v-96qf)", () => {
  it("extracts a normal baggage header", () => {
    expect(extractEntries("a=1,b=2")).toBe(2);
  });

  it("caps the number of extracted entries", () => {
    const header = Array.from({ length: 5000 }, (_, i) => `k${i}=v`).join(",");
    expect(extractEntries(header)).toBeLessThanOrEqual(180);
  });

  it("ignores a single entry over the per-entry size limit", () => {
    expect(extractEntries(`big=${"x".repeat(5000)}`)).toBe(0);
  });
});
