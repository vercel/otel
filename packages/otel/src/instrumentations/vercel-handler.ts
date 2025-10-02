import {
  TracerProvider,
  MeterProvider,
  propagation,
  context,
} from "@opentelemetry/api";
import type {
  Instrumentation,
  InstrumentationConfig,
} from "@opentelemetry/instrumentation";
import { Server } from "node:http";

export interface VercelHandlerInstrumentationConfig
  extends InstrumentationConfig {}

export class VercelHandlerInstrumentation implements Instrumentation {
  instrumentationName = "@vercel/otel/handlers";
  instrumentationVersion = "1.0.0";
  instrumentationDescription?: string;

  traceProvider?: TracerProvider;
  supportedVersions?: string[];

  enabled = false;

  constructor(readonly config: VercelHandlerInstrumentationConfig) {
    patchEmit(() => this.enabled);
    this.enabled = config.enabled ?? false;
  }
  disable(): void {
    this.enabled = false;
  }
  enable(): void {
    this.enabled = true;
  }
  setTracerProvider(tracerProvider: TracerProvider): void {
    this.traceProvider = tracerProvider;
  }
  setMeterProvider(_meterProvider: MeterProvider): void {
    // nothing
  }
  setConfig(_config: InstrumentationConfig): void {
    // nothing
  }
  getConfig(): InstrumentationConfig {
    return this.config;
  }
}

function patchEmit(isEnabled: () => boolean) {
  const emit = Server.prototype.emit;
  Server.prototype.emit = function (event: any, ...args: any[]) {
    const next = () => emit.call(this, event, ...args);
    if (isEnabled() && event === "request") {
      const request = args[0];
      console.log("instrumenting request", request.headers);
      const c = propagation.extract(context.active(), request.headers);
      return context.with(c, next);
    }

    return next();
  };
}
