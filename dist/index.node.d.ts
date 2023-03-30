export * from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
export declare const registerOTel: (serviceName: string) => NodeTracerProvider;
