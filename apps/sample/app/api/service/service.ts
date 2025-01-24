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

      let body: BodyInit | null = null;
      const isFormData = url.searchParams.get("mode") === "formdata";
      if (isFormData) {
        const fd = new FormData();
        fd.set("cmd", "echo");
        fd.set("data.foo", "bar");
        body = fd;
      } else {
        body = JSON.stringify({ cmd: "echo", data: { foo: "bar" } });
      }

      const response = await fetch(dataUrl, {
        method: "POST",
        body,
        headers: { "X-Cmd": "echo" },
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
