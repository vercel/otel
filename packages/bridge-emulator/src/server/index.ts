import type { Configuration } from "@vercel/otel";
import type {
  Context,
  SpanContext,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
} from "@opentelemetry/api";

export interface VercelRequestContext {
  waitUntil: (
    promiseOrFunc: Promise<unknown> | (() => Promise<unknown>),
  ) => void;
  headers: Record<string, string | undefined>;
  url: string;
  telemetry?: {
    reportSpans: (data: unknown) => void;
    rootSpanContext?: SpanContext;
  };
  [key: symbol]: unknown;
}

interface Reader {
  get: () => VercelRequestContext | undefined;
}

const symbol = Symbol.for("@vercel/request-context");

interface GlobalWithReader {
  [symbol]?: Reader;
}

let contextCache: VercelRequestContext | undefined;

export function start(config: Configuration): Configuration {
  const reader: Reader = {
    get: () => contextCache,
  };
  (globalThis as GlobalWithReader)[symbol] = reader;

  return {
    ...config,
    propagators: [
      new BridgeEmulatorContextReader(),
      ...(config.propagators ?? ["auto"]),
    ],
  };
}

export class BridgeEmulatorContextReader implements TextMapPropagator {
  inject(context: Context, _carrier: unknown, _setter: TextMapSetter): Context {
    // Nothing.
    return context;
  }

  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    contextCache = undefined;

    const allHeaders = Object.fromEntries(
      getter.keys(carrier).map((key) => {
        const value = getter.get(carrier, key);
        if (value && Array.isArray(value)) {
          return [key, value[0]];
        }
        return [key, value];
      }),
    );
    const {
      "x-otel-test-id": testId,
      "x-otel-test-url": url,
      "x-otel-test-bridge-port": bridgePort,
      ...headers
    } = allHeaders;
    if (testId && bridgePort) {
      let responseAck: Promise<unknown> | undefined;
      contextCache = {
        headers,
        url: url ?? "",
        waitUntil: (pf): void => {
          if (!responseAck) {
            responseAck = fetch(`http://127.0.0.1:${bridgePort}`, {
              method: "POST",
              body: JSON.stringify({
                cmd: "ack",
                testId,
                runtime: process.env.NEXT_RUNTIME,
              }),
              headers: { "content-type": "application/json" },
              // @ts-expect-error - internal Next request.
              next: { internal: true },
            });
          }
          void responseAck
            .then(async () => {
              return new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 200);
              });
            })
            .then(async () => {
              try {
                await (typeof pf === "function" ? pf() : pf);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error("[BridgeEmulatorServer] waitUntil error:", e);
              }
            });
        },
        telemetry: {
          reportSpans: (data): void => {
            // eslint-disable-next-line no-console
            console.log("[BridgeEmulatorServer] reportSpans", data);
          },
        },
      };
    }

    return context;
  }

  fields(): string[] {
    return [];
  }
}
