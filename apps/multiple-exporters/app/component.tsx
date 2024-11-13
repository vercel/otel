import { SpanStatusCode, trace } from "@opentelemetry/api";

export interface Props {
  searchParams?: {
    dataUrl?: string;
    status?: string;
    error?: string;
  };
}

export async function Component({ searchParams }: Props): Promise<JSX.Element> {
  const data = await trace.getTracer("sample").startActiveSpan(
    "sample-span",
    {
      attributes: {
        foo: "bar",
      },
    },
    async (span) => {
      if (searchParams?.error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: "error from component",
        });
        span.end();
        const error = new Error("error from component");
        (error as any).status = 500;
        throw error;
      }
      const dataUrl = searchParams?.dataUrl;
      if (!dataUrl) {
        span.end();
        return null;
      }
      try {
        const response = await fetch(dataUrl, {
          method: "POST",
          body: JSON.stringify({
            cmd: searchParams.status ? "status" : "echo",
            data: { status: searchParams.status, foo: "bar" },
          }),
          cache: "no-store",
          headers: { "X-Cmd": "echo" },
          opentelemetry: {
            attributes: {
              custom1: "value1",
            },
          },
        });
        const data = await trace
          .getTracer("sample")
          .startActiveSpan("process-response", async (span2) => {
            try {
              const isJson = response.headers
                .get("content-type")
                ?.includes("json");
              const json = await (isJson ? response.json() : response.text());
              await new Promise((resolve) => setTimeout(resolve, 50));
              span2.end();
              return json;
            } catch (e) {
              span2.setStatus({
                code: SpanStatusCode.ERROR,
                message: e instanceof Error ? e.message : String(e),
              });
              span2.end();
              throw e;
            }
          });
        span.end();
        return data;
      } catch (e) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e instanceof Error ? e.message : String(e),
        });
        span.end();
        return null;
      }
    }
  );
  return (
    <main className="p-6">Serverless component: {JSON.stringify(data)}</main>
  );
}
