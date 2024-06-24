import { beforeEach, describe, expect, it } from "vitest";
import type { Context, TextMapGetter, TextMapSetter } from "@opentelemetry/api";
import {
  context as contextApi,
  createTraceState,
  trace as traceApi,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "./w3c-tracecontext-propagator";

describe("W3CTraceContextPropagator", () => {
  let baseContext: Context;
  let propagator: W3CTraceContextPropagator;

  beforeEach(() => {
    propagator = new W3CTraceContextPropagator();
    baseContext = contextApi.active();
  });

  it("should return fields", () => {
    expect(propagator.fields()).toEqual(["traceparent", "tracestate"]);
  });

  describe("exract", () => {
    it("should extract the trace parent", () => {
      const context = propagator.extract(
        baseContext,
        new Map([
          [
            "traceparent",
            "00-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01",
          ],
        ]),
        GETTER
      );
      expect(traceApi.getSpanContext(context)).toEqual({
        isRemote: true,
        traceId: "6d2eac29c9283ece795b4fbaa2d57225",
        spanId: "bad4e819c34d2cdb",
        traceFlags: 1,
      });
    });

    it("should extract the trace parent as an array", () => {
      const context = propagator.extract(
        baseContext,
        new Map([
          [
            "traceparent",
            ["00-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01"],
          ],
        ]),
        GETTER
      );
      expect(traceApi.getSpanContext(context)).toEqual({
        isRemote: true,
        traceId: "6d2eac29c9283ece795b4fbaa2d57225",
        spanId: "bad4e819c34d2cdb",
        traceFlags: 1,
      });
    });

    it("should extract the trace state", () => {
      const context = propagator.extract(
        baseContext,
        new Map([
          [
            "traceparent",
            "00-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01",
          ],
          ["tracestate", "foo=11,bar=12"],
        ]),
        GETTER
      );
      expect(traceApi.getSpanContext(context)).toContain({
        isRemote: true,
        traceId: "6d2eac29c9283ece795b4fbaa2d57225",
        spanId: "bad4e819c34d2cdb",
        traceFlags: 1,
      });
      expect(traceApi.getSpanContext(context)?.traceState?.get("foo")).toBe(
        "11"
      );
      expect(traceApi.getSpanContext(context)?.traceState?.get("bar")).toBe(
        "12"
      );
    });

    describe("failure cases", () => {
      it("should NOT extract invalid trace parent", () => {
        const context = propagator.extract(
          baseContext,
          new Map([["traceparent", "00-bad-bad4e819c34d2cdb-01"]]),
          GETTER
        );
        expect(traceApi.getSpanContext(context)).toBeUndefined();
      });

      it("should NOT extract invalid span", () => {
        const context = propagator.extract(
          baseContext,
          new Map([
            ["traceparent", "00-6d2eac29c9283ece795b4fbaa2d57225-bad-01"],
          ]),
          GETTER
        );
        expect(traceApi.getSpanContext(context)).toBeUndefined();
      });

      it("should NOT extract invalid version", () => {
        const context = propagator.extract(
          baseContext,
          new Map([
            [
              "traceparent",
              "bad-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01",
            ],
          ]),
          GETTER
        );
        expect(traceApi.getSpanContext(context)).toBeUndefined();
      });

      it("should NOT extract invalid version", () => {
        const context = propagator.extract(
          baseContext,
          new Map([
            [
              "traceparent",
              "00-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01-unknown",
            ],
          ]),
          GETTER
        );
        expect(traceApi.getSpanContext(context)).toBeUndefined();
      });
    });
  });

  describe("inject", () => {
    it("should inject the trace parent", () => {
      const carrier = new Map<string, string | string[]>();
      const context = traceApi.setSpanContext(baseContext, {
        traceId: "6d2eac29c9283ece795b4fbaa2d57225",
        spanId: "bad4e819c34d2cdb",
        traceFlags: 1,
      });
      propagator.inject(context, carrier, SETTER);
      expect(carrier.get("traceparent")).toBe(
        "00-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01"
      );
      expect(carrier.get("tracestate")).toBeUndefined();
    });

    it("should inject the trace state", () => {
      const carrier = new Map<string, string | string[]>();
      const context = traceApi.setSpanContext(baseContext, {
        traceId: "6d2eac29c9283ece795b4fbaa2d57225",
        spanId: "bad4e819c34d2cdb",
        traceFlags: 1,
        traceState: createTraceState("foo=11,bar=12"),
      });
      propagator.inject(context, carrier, SETTER);
      expect(carrier.get("traceparent")).toBe(
        "00-6d2eac29c9283ece795b4fbaa2d57225-bad4e819c34d2cdb-01"
      );
      expect(carrier.get("tracestate")).toEqual("foo=11,bar=12");
    });

    describe("failure cases", () => {
      it("should NOT inject empty span", () => {
        const carrier = new Map<string, string | string[]>();
        propagator.inject(baseContext, carrier, SETTER);
        expect(carrier.get("traceparent")).toBeUndefined();
        expect(carrier.get("tracestate")).toBeUndefined();
      });

      it("should inject an invalid span parent", () => {
        const carrier = new Map<string, string | string[]>();
        const context = traceApi.setSpanContext(baseContext, {
          traceId: "bad",
          spanId: "worse",
          traceFlags: -1,
        });
        propagator.inject(context, carrier, SETTER);
        expect(carrier.get("traceparent")).toBeUndefined();
        expect(carrier.get("tracestate")).toBeUndefined();
      });
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
