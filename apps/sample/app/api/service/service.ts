import type * as http from 'node:http';
import { Span, trace } from "@opentelemetry/api";

export function runService(request: Request, httpModule?: typeof http): Promise<string> {
  const url = new URL(request.url);
  const fetchType = url.searchParams.get("fetchType") ?? "fetch";
  return trace.getTracer("sample").startActiveSpan(
    "sample-span",
    {
      attributes: {
        foo: "bar",
        "fetch.type": fetchType,
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
      if (httpModule && fetchType === "http") {
        const internalServiceRequest = new Request(dataUrl, {
          method: "POST",
          body,
        });
        const td = new TextDecoder('utf-8');
        const httpBody = td.decode(await internalServiceRequest.arrayBuffer());
        const headersForNodeRequest: Record<string, string> = {}
        internalServiceRequest.headers.forEach((value, key) => {
          headersForNodeRequest[key] = value
        })
        headersForNodeRequest["Content-Length"] = String(Buffer.byteLength(httpBody, "utf-8"))
        return makeApiCallWithHttp(
          dataUrl,
          {
            body: httpBody,
            headers: { "X-Cmd": "echo", ...headersForNodeRequest }
          },
          span,
          httpModule
        );
      }
      return makeApiCallWithFetch(
        dataUrl,
        {
          body, headers: { "X-Cmd": "echo" }
        },
        span
      );
    }
  );
}

async function makeApiCallWithFetch(
  dataUrl: string,
  { body, headers }: {
    body: BodyInit | null;
    headers: Record<string, string>;
  },
  span: Span
): Promise<string> {
  const response = await fetch(dataUrl, {
    method: "POST",
    body,
    headers,
    cache: "no-store",
  })
  if (dataUrl.includes("example")) {
    span.end();
    return await response.text();
  }
  const json = await response.json();
  span.end();
  return json.foo;
}

async function makeApiCallWithHttp(
  dataUrl: string,
  { body, headers }: {
    body: Buffer | string;
    headers: Record<string, string>;
  },
  span: Span,
  httpModule: typeof http
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(dataUrl);
    const options = {
      method: "POST",
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        ...headers,
      },
    };

    const request = httpModule.request(options, (response: http.IncomingMessage) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        span.end();
        if (dataUrl.includes("example")) {
          resolve(data);
        }
        let json;
        try {
          json = JSON.parse(data);
        } catch (err) {
          reject(err);
        }

        resolve(json.foo);
      });
    });

    request.on("error", (err: unknown) => {
      reject(err);
    });

    request.write(body);
    request.end();
  });
}

