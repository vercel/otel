import { describe, expect, it } from "vitest";
import type { Context, TextMapGetter, TextMapSetter } from "@opentelemetry/api";
import { ROOT_CONTEXT, propagation } from "@opentelemetry/api";
import { W3CBaggagePropagator } from "./w3c-baggage-propagator";

describe("W3CBaggagePropagator", () => {
  const propagator = new W3CBaggagePropagator();

  function extract(header: string | string[]): Context {
    return propagator.extract(
      ROOT_CONTEXT,
      new Map([["baggage", header]]),
      GETTER,
    );
  }

  function entryKeys(context: Context): string[] {
    return (
      propagation
        .getBaggage(context)
        ?.getAllEntries()
        .map(([key]) => key) ?? []
    );
  }

  it("should return fields", () => {
    expect(propagator.fields()).toEqual(["baggage"]);
  });

  describe("extract", () => {
    it("should extract entries with metadata", () => {
      const baggage = propagation.getBaggage(
        extract("key1=d4cda95b,key3=c88815a7;prop1=value1, key%202=a%20b"),
      );
      expect(baggage?.getEntry("key1")).toEqual({ value: "d4cda95b" });
      expect(baggage?.getEntry("key3")?.value).toBe("c88815a7");
      expect(baggage?.getEntry("key3")?.metadata?.toString()).toBe(
        "prop1=value1",
      );
      expect(baggage?.getEntry("key 2")).toEqual({ value: "a b" });
    });

    it("should extract entries from every header value", () => {
      expect(entryKeys(extract(["a=1,b=2", "c=3"]))).toEqual(["a", "b", "c"]);
    });

    it("should return the same context without a baggage header", () => {
      expect(propagator.extract(ROOT_CONTEXT, new Map(), GETTER)).toBe(
        ROOT_CONTEXT,
      );
    });

    it("should return the same context without valid entries", () => {
      expect(extract("=1,novalue=,noequals")).toBe(ROOT_CONTEXT);
    });

    it("should skip entries with invalid percent-encoding", () => {
      expect(entryKeys(extract("bad=%E0%A4%A,good=1"))).toEqual(["good"]);
    });

    it("should extract at most 180 entries", () => {
      const header = Array.from({ length: 5000 }, (_, i) => `k${i}=v`).join(
        ",",
      );
      const keys = entryKeys(extract(header));
      expect(keys).toHaveLength(180);
      expect(keys[179]).toBe("k179");
    });

    it("should count entries across header values toward the limit", () => {
      const header = Array.from({ length: 100 }, (_, i) => `k${i}=v`).join(",");
      expect(
        entryKeys(extract([header, header.replace(/k/g, "j")])),
      ).toHaveLength(180);
    });

    it("should skip an entry over 4096 bytes and keep later entries", () => {
      const keys = entryKeys(
        extract(`a=1,big=${"x".repeat(4096)},b=2,ok=${"y".repeat(4093)}`),
      );
      expect(keys).toEqual(["a", "b", "ok"]);
    });

    it("should stop before the total exceeds 8192 bytes", () => {
      // Each entry is 1,000 bytes, plus a comma after the first.
      const entry = (i: number): string => `k${i}=${"v".repeat(997)}`;
      const header = Array.from({ length: 10 }, (_, i) => entry(i)).join(",");
      const keys = entryKeys(extract(header));
      expect(keys).toHaveLength(8);
    });
  });

  describe("inject", () => {
    it("should round-trip extracted baggage", () => {
      const carrier = new Map<string, string | string[]>();
      propagator.inject(extract("a=1,b=2;p=1"), carrier, SETTER);
      expect(carrier.get("baggage")).toBe("a=1,b=2;p=1");
    });
  });
});

type Carrier = Map<string, string | string[]>;

const GETTER: TextMapGetter<Carrier> = {
  get: (carrier, key) => carrier.get(key),
  keys: (carrier) => Array.from(carrier.keys()),
};

const SETTER: TextMapSetter<Carrier> = {
  set: (carrier, key, value) => carrier.set(key, value),
};
