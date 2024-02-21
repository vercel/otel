import { trace } from "@opentelemetry/api";

export function runService(request: Request): Promise<string> {
  const url = new URL(request.url);
  return trace.getTracer("sample").startActiveSpan(
    "sample-span",
    {
      attributes: {
        foo: "bar",
      },
    },
    async (span) => {
      const dataUrl = url.searchParams.get("dataUrl");
      if (!dataUrl) {
        span.end();
        return "<no data>";
      }

      const response = await fetch(dataUrl, {
        method: "POST",
        body: JSON.stringify({ cmd: "echo", data: { foo: "bar" } }),
        cache: "no-store",
      });
      if (dataUrl.includes("example")) {
        span.end();
        return await response.text();
      }
      const json = await response.json();
      span.end();
      return json.foo;
    }
  );
}
