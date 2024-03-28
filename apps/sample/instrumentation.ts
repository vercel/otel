import { type Configuration, registerOTel } from "@vercel/otel";
import { start as startBridgeEmulator } from "bridge-emulator/server";
import {
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";

export function register() {
  let config: Configuration = {
    serviceName: "sample-app",
    instrumentationConfig: {
      fetch: {
        ignoreUrls: [/^https:\/\/telemetry.nextjs.org/],
        propagateContextUrls: [/^http:\/\/localhost:\d+/],
        dontPropagateContextUrls: [/no-propagation\=1/],
        attributesFromRequestHeaders: {
          "request.cmd": "X-Cmd",
        },
        attributesFromResponseHeaders: {
          "response.server": "X-Server",
        },
      },
    },
    attributesFromHeaders: {
      client: "X-Client",
    },
  };
  if (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "test") {
    config = startBridgeEmulator(config);
  }
  if (process.env.TEST_FETCH_RESOURCE_NAME_TEMPLATE) {
    console.log(
      "Custom fetch resourceNameTemplate:",
      process.env.TEST_FETCH_RESOURCE_NAME_TEMPLATE
    );
    config = {
      ...config,
      instrumentationConfig: {
        ...config.instrumentationConfig,
        fetch: {
          ...config.instrumentationConfig?.fetch,
          resourceNameTemplate: process.env.TEST_FETCH_RESOURCE_NAME_TEMPLATE,
        },
      },
    };
  }
  if (process.env.TEST_SPAN_PROCESSOR == "console") {
    console.log("Custom span processor: console");
    config = {
      ...config,
      spanProcessors: [
        new SimpleSpanProcessor(new ConsoleSpanExporter()),
        ...(config.spanProcessors ?? []),
      ],
    };
  }
  registerOTel(config);

  /*
  const origConsoleError = console.error;
  if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("uncaughtException", (e) => {
      origConsoleError("[uncaughtException]", e);
    });
    process.on("unhandledRejection", (e) => {
      origConsoleError("[unhandledRejection]", e);
    });
  }
  console.error = (...args: unknown[]) => {
    const error = args.find((arg) => {
      return arg && arg instanceof Error;
    });
    origConsoleError(
      "[console_error]",
      "hasError:",
      !!error,
      "digest:",
      (error as any | undefined)?.digest,
      ...args
    );
  };
  */
}
