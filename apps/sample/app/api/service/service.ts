import type * as http from 'node:http';
import { Span, trace } from "@opentelemetry/api";

export function runService(request: Request): Promise<string> {
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
      if (fetchType === "http") {
        const req = new Request(location.origin, {
          method: `POST`,
          body,
        });
        const td = new TextDecoder('utf-8');
        const httpBody = td.decode(await req.arrayBuffer());
        return makeApiCallWithHttp(
          dataUrl,
          {
            body: httpBody,
            headers: { "X-Cmd": "echo" }
          },
          span
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

function makeApiCallWithHttp(
  dataUrl: string,
  { body, headers }: {
    body: Buffer | string;
    headers: Record<string, string>;
  },
  span: Span
): Promise<string> {
  const protocol = dataUrl.startsWith("https") ? "https" : "http";
  return new Promise((resolve, reject) => {
    const { request } = require(protocol);
    const options = {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
    };

    const req = request(dataUrl, options, (res: http.IncomingMessage) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
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

    req.on("error", (err: unknown) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

