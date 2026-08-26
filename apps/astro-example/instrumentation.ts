import { registerOTel } from "@vercel/otel";

registerOTel({
  serviceName: "astro-example",
});
