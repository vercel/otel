import {
  context,
  diag,
  DiagLogLevel,
  logs,
  metrics,
  propagation,
  trace,
} from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import {
  SimpleLogRecordProcessor,
  type LogRecordExporter,
  type ReadableLogRecord,
} from "@opentelemetry/sdk-logs";
import type {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from "@opentelemetry/sdk-trace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sdk } from "./sdk";

const MANAGED_PREFIXES = ["OTEL_", "VERCEL_OTEL_"];

describe("Sdk env configuration", () => {
  let active: Sdk | undefined;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of Object.keys(process.env)) {
      if (MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        savedEnv[key] = process.env[key];
        process.env[key] = "";
      }
    }
  });

  afterEach(async () => {
    await stop();
    for (const key of Object.keys(process.env)) {
      if (MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        process.env[key] = "";
      }
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  async function stop(): Promise<void> {
    const sdk = active;
    active = undefined;
    if (sdk) {
      await sdk.shutdown();
    }
    trace.disable();
    logs.disable();
    metrics.disable();
    propagation.disable();
    context.disable();
    diag.disable();
  }

  function start(configuration: ConstructorParameters<typeof Sdk>[0]): {
    spans: ReadableSpan[];
  } {
    const spans: ReadableSpan[] = [];
    const exporter: SpanExporter = {
      export(batch, resultCallback) {
        spans.push(...batch);
        resultCallback({ code: ExportResultCode.SUCCESS });
      },
      shutdown() {
        return Promise.resolve();
      },
      forceFlush() {
        return Promise.resolve();
      },
    };
    active = new Sdk({
      serviceName: "env-test",
      autoDetectResources: false,
      instrumentations: [],
      spanProcessors: [],
      traceExporter: exporter,
      ...configuration,
    });
    active.start();
    return { spans };
  }

  it("truncates span attributes per OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT", async () => {
    process.env.OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT = "5";
    const { spans } = start({});
    const span = trace.getTracer("test").startSpan("op");
    span.setAttribute("k", "abcdefghij");
    span.end();
    await stop();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes.k).toBe("abcde");
  });

  it("falls back to OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT for spans and log records", async () => {
    process.env.OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT = "4";
    const records: ReadableLogRecord[] = [];
    const logExporter: LogRecordExporter = {
      export(batch, resultCallback) {
        records.push(...batch);
        resultCallback({ code: ExportResultCode.SUCCESS });
      },
      shutdown() {
        return Promise.resolve();
      },
      forceFlush() {
        return Promise.resolve();
      },
    };
    const { spans } = start({
      logRecordProcessors: [
        new SimpleLogRecordProcessor({ exporter: logExporter }),
      ],
    });
    const span = trace.getTracer("test").startSpan("op");
    span.setAttribute("k", "abcdefghij");
    span.end();
    logs.getLogger("test").emit({ attributes: { msg: "abcdefghij" } });
    expect(records).toHaveLength(1);
    expect(records[0]?.attributes.msg).toBe("abcd");
    await stop();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes.k).toBe("abcd");
  });

  it("lets configuration.spanLimits win over env, field by field", async () => {
    process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT = "1";
    process.env.OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT = "8";
    const { spans } = start({
      spanLimits: { attributeValueLengthLimit: 3 },
    });
    const span = trace.getTracer("test").startSpan("op");
    span.setAttribute("kept", "abcdef");
    span.setAttribute("dropped", "z");
    span.end();
    await stop();
    expect(spans[0]?.attributes.kept).toBe("abc");
    expect(spans[0]?.attributes.dropped).toBeUndefined();
    expect(spans[0]?.droppedAttributesCount).toBe(1);

    process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT = "1";
    const second = start({
      spanLimits: { attributeCountLimit: undefined },
    });
    const again = trace.getTracer("test").startSpan("op");
    again.setAttribute("first", "a");
    again.setAttribute("second", "b");
    again.end();
    await stop();
    expect(second.spans[0]?.attributes.first).toBe("a");
    expect(second.spans[0]?.attributes.second).toBeUndefined();
    expect(second.spans[0]?.droppedAttributesCount).toBe(1);
  });

  it("lets a configured processor's onEnding change attributes before export", async () => {
    const redactor: SpanProcessor = {
      onStart: () => undefined,
      onEnding(span) {
        span.setAttribute("secret", "[redacted]");
      },
      onEnd: () => undefined,
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    const { spans } = start({ spanProcessors: [redactor] });
    const span = trace.getTracer("test").startSpan("op");
    span.setAttribute("secret", "hunter2");
    span.end();
    await stop();
    expect(spans[0]?.attributes.secret).toBe("[redacted]");
  });

  it("exports within OTEL_BSP_SCHEDULE_DELAY without an explicit flush", async () => {
    process.env.OTEL_BSP_SCHEDULE_DELAY = "50";
    let resolveExported: (spans: ReadableSpan[]) => void = () => undefined;
    const exported = new Promise<ReadableSpan[]>((resolve) => {
      resolveExported = resolve;
    });
    const spans: ReadableSpan[] = [];
    const exporter: SpanExporter = {
      export(batch, resultCallback) {
        spans.push(...batch);
        resolveExported(spans);
        resultCallback({ code: ExportResultCode.SUCCESS });
      },
      shutdown() {
        return Promise.resolve();
      },
      forceFlush() {
        return Promise.resolve();
      },
    };
    active = new Sdk({
      serviceName: "env-test",
      autoDetectResources: false,
      instrumentations: [],
      spanProcessors: [],
      traceExporter: exporter,
    });
    active.start();
    const span = trace.getTracer("test").startSpan("op");
    span.end();
    const winner = await Promise.race([
      exported.then(() => "exported" as const),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 500);
      }),
    ]);
    expect(winner).toBe("exported");
    expect(spans[0]?.name).toBe("op");
  });

  it.each(["abc", "-1", "1.5", "Infinity"])(
    "ignores invalid limit %s and keeps the SDK default",
    async (raw) => {
      process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT = raw;
      const warnings: string[] = [];
      const ignore = (): void => undefined;
      diag.setLogger(
        {
          verbose: ignore,
          debug: ignore,
          info: ignore,
          warn(...args: unknown[]): void {
            warnings.push(args.map(String).join(" "));
          },
          error: ignore,
        },
        DiagLogLevel.ALL,
      );
      const { spans } = start({});
      const span = trace.getTracer("test").startSpan("op");
      for (let i = 0; i < 129; i += 1) {
        span.setAttribute(`a${i}`, "x");
      }
      span.end();
      await stop();
      expect(warnings.filter((line) => line.includes(raw))).toHaveLength(1);
      const kept = Object.keys(spans[0]?.attributes ?? {}).filter((key) =>
        /^a\d+$/.test(key),
      );
      expect(kept).toHaveLength(128);
      expect(spans[0]?.droppedAttributesCount).toBe(1);
    },
  );
});
