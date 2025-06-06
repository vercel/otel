import { SpanStatusCode, trace } from "@opentelemetry/api";
import type * as Http from "node:http";
export interface Props {
  searchParams?: {
    dataUrl?: string;
    status?: string;
    error?: string;
  };
  http: typeof Http | undefined;
}

export async function Component({ searchParams, http }: Props): Promise<JSX.Element> {
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
        const url = new URL(dataUrl);
        const isFetch = url.searchParams.get("fetchType") !== "http";
        url.searchParams.delete("fetchType");
        const body = JSON.stringify({
          cmd: searchParams.status ? "status" : "echo",
          data: { status: searchParams.status, foo: "bar" },
        });
        const headers = { "X-Cmd": "echo" };
        let response: unknown;
        if (isFetch){
          response = await makeApiCallWithFetch(url.toString(), {
            body,
            headers,
          });
        } else {
          if (!http) {
            throw new Error("HTTP module is not available");
          }
          response = await makeApiCallWithHttp(http, url.toString(), {
            body,
            headers,
          });
        }

        return response;
      } catch (e) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e instanceof Error ? e.message : String(e),
        });
        return null;
      } finally {
        span.end();
      }
    }
  );
  return (
    <main className="p-6">Serverless component: {JSON.stringify(data)}</main>
  );
}

async function makeApiCallWithFetch(
  url: string,
  init: RequestInit
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    body: init.body,
    headers: init.headers,
    cache: "no-store",
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
  return data;
}

function makeApiCallWithHttp(httpModule: typeof import("node:http"), url: string, init: { body: string; headers: Record<string, string> }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = httpModule.request(url, {
      method: "POST",
      headers: init.headers,
    }, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        trace.getTracer("sample").startActiveSpan("process-response", async (span2) => {
          try {
            const isJson = response.headers["content-type"]?.includes("json");
            const json = isJson ? JSON.parse(data) : data;
            await new Promise((r) => setTimeout(r, 50));
            resolve(json);
          } catch (e) {
            span2.setStatus({
              code: SpanStatusCode.ERROR,
              message: e instanceof Error ? e.message : String(e),
            });
            reject(e);
          } finally {
            span2.end();
          }
        });
      });

      response.on("error", (err) => {
        reject(err);
      });
    });

    request.on("error", (err) => {
      reject(err);
    });

    request.write(init.body);
    request.end();
  });
}