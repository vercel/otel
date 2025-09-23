// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { metrics as metricsApi } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { MeterRecorder } from "./test-util/meter-recorder";
import {
  getActiveSpan,
  injectTraceContext,
  meterHistogram,
  rootTraceContext,
  trace,
} from "./index";

describe("via otel SDK", () => {
  let sdk: NodeSDK;
  let spans: ReadableSpan[];
  let meterRecorder: MeterRecorder;

  beforeEach(() => {
    spans = [];
    sdk = new NodeSDK({
      spanProcessors: [
        {
          onStart(_sp): void {
            // Nothing.
          },

          onEnd(sp): void {
            spans.push(sp);
          },

          async shutdown(): Promise<void> {
            await Promise.resolve();
          },

          async forceFlush(): Promise<void> {
            await Promise.resolve();
          },
        },
      ],
    });
    meterRecorder = new MeterRecorder();
    metricsApi.setGlobalMeterProvider(meterRecorder);
    sdk.start();
  });

  afterEach(async () => {
    metricsApi.disable();
    await sdk.shutdown();
  });

  describe("tracing", () => {
    it("a span without options", async () => {
      const value: number = trace(
        "test",
        { attributes: { foo: "bar" } },
        () => 42
      );
      expect(value).toBe(42);

      await sdk.shutdown();
      expect(spans).toHaveLength(1);
      const sp = spans[0]!;
      expect(sp.name).toBe("test");
      expect(sp.attributes.foo).toBe("bar");
    });

    it("active context", () => {
      expect(getActiveSpan()).toBeUndefined();

      let activeSpan: ReturnType<typeof getActiveSpan>;
      trace("test", { attributes: { foo: "bar" } }, () => {
        activeSpan = getActiveSpan();
        return 42;
      });
      expect((activeSpan as ReadableSpan | undefined)?.name).toBe("test");
    });

    it("a root span without propagation", async () => {
      const value: number = rootTraceContext(() => {
        return trace(
          "test",
          {
            attributes: { foo: "bar" },
          },
          () => {
            return rootTraceContext(() => trace("test2", () => 42));
          }
        );
      });
      expect(value).toBe(42);

      await sdk.shutdown();
      expect(spans).toHaveLength(2);
      const sp = spans[0]!;
      expect(sp.name).toBe("test2");
      expect(sp.parentSpanContext).toBeUndefined();
    });

    it("a root span with propagation", async () => {
      const value: number = rootTraceContext(
        () => {
          return trace(
            "test",
            {
              attributes: { foo: "bar" },
            },
            () => 42
          );
        },
        {
          traceparent: `00-ee75cd9e534ff5e9ed78b4a0c706f0f2-0f6a325411bdc432-01`,
        }
      );
      expect(value).toBe(42);

      await sdk.shutdown();
      expect(spans).toHaveLength(1);
      const sp = spans[0]!;
      expect(sp.spanContext().traceId).toBe("ee75cd9e534ff5e9ed78b4a0c706f0f2");
      expect(sp.parentSpanContext?.spanId).toBe("0f6a325411bdc432");
      expect(sp.spanContext().spanId).not.toBe("0f6a325411bdc432");
      expect(sp.name).toBe("test");
      expect(sp.attributes.foo).toBe("bar");
    });

    it("should inject context", () => {
      const carrier: Record<string, unknown> = {};
      trace("test", { attributes: { foo: "bar" } }, () => {
        injectTraceContext(null, carrier);
      });
      expect(carrier.traceparent).toMatch(/00-[a-zA-Z0-9]{32}/);
    });
  });

  describe("metrics", () => {
    it("a histogram", async () => {
      meterHistogram("test", 57, { unit: "ms", attributes: { foo: "bar" } });

      await sdk.shutdown();

      expect(meterRecorder.metrics).toHaveLength(1);
      const m = meterRecorder.metrics[0]!;
      expect(m.name).toBe("test");
      expect(m.value).toBe(57);
      expect(m.attributes?.foo).toBe("bar");
      expect(m.units).toBe("ms");
    });
  });
});
