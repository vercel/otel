import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
export * as api from "@opentelemetry/api";

export let registerOTel: (
  serviceName: string
) => NodeTracerProvider | undefined;

// It would be better to do this split using `exports` in package.json (for better tree-shaking),
// but I wasn't able to get it to work
if (process.env.NEXT_RUNTIME === "nodejs") {
  registerOTel = (serviceName: string) => {
    return (
      require("./register.node") as typeof import("./register.node")
    ).registerOTel(serviceName);
  };
} else {
  registerOTel = (serviceName: string) => {
    // We don't initialize OTel in the browser/edge
    void serviceName;
    return undefined;
  };
}
