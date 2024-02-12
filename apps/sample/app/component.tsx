import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { RequestInitWithOpenTelemetry } from "@vercel/otel";

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
        console.log("QQQQ: Component.tsx: fetch with:", {
          method: "POST",
          body: JSON.stringify({
            cmd: searchParams.status ? "status" : "echo",
            data: { status: searchParams.status, foo: "bar" },
          }),
          opentelemetry: {
            attributes: {
              custom1: "value1",
            },
          },
        });
        const response = await fetch(dataUrl, {
          method: "POST",
          body: JSON.stringify({
            cmd: searchParams.status ? "status" : "echo",
            data: { status: searchParams.status, foo: "bar" },
          }),
          cache: "no-store",
          opentelemetry: {
            attributes: {
              custom1: "value1",
            },
          },
        } as RequestInitWithOpenTelemetry);
        const json = await response.json();
        span.end();
        return json;
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
