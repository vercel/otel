import { Server, type IncomingMessage, type ServerResponse } from "node:http";
import formidable from "formidable";

export interface Bridge {
  port: number;
  fetches: Request[];
  reportedSpans: object[];
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  reset: () => void;
  close: () => void;
}

interface BridgeOptions {
  serverPort: number;
  traceDrains?: string[];
}

export async function start(opts: BridgeOptions): Promise<Bridge> {
  const server = new BridgeEmulatorServer(opts);
  await server.connect();
  return server;
}

interface AckRequest {
  cmd: "ack";
  testId: string;
}

interface EchoRequest {
  cmd: "echo";
  data: object;
}

interface StatusRequest {
  cmd: "status";
  data: { status: string; [key: string]: unknown };
}

interface ReportSpansRequest {
  cmd: "reportSpans";
  testId: string;
  runtime?: string;
  data: object;
}

interface UnknownRequest {
  cmd: "unknown";
}

type BridgeEmulatorRequest =
  | UnknownRequest
  | AckRequest
  | EchoRequest
  | StatusRequest
  | ReportSpansRequest;

class BridgeEmulatorServer implements Bridge {
  public port = -1;
  private serverPort: number;
  private server: Server | undefined;
  private waitingAck = new Map<string, Promise<unknown>>();
  private traceDrains: string[] | undefined;
  public fetches: Request[] = [];
  public reportedSpans: object[] = [];

  constructor({ serverPort, traceDrains }: BridgeOptions) {
    this.serverPort = serverPort;
    this.traceDrains = traceDrains;
  }

  async connect(): Promise<void> {
    const handler = async (
      req: IncomingMessage,
      res: ServerResponse,
    ): Promise<void> => {
      let json: BridgeEmulatorRequest;
      if ((req.headers["content-type"] ?? "").includes("multipart/form-data")) {
        json = await new Promise<BridgeEmulatorRequest>((resolve, reject) => {
          const inst = formidable({});
          inst.parse(req, (err, fields, _files) => {
            if (err) {
              reject(err);
              return;
            }
            resolve({
              cmd: Array.isArray(fields.cmd) ? fields.cmd[0] : fields.cmd,
              data: Object.fromEntries(
                Object.entries(fields)
                  .filter(([key]) => key.startsWith("data."))
                  .map(([key, value]) => [
                    key.slice(5),
                    Array.isArray(value) ? value[0] : value,
                  ]),
              ),
            } as unknown as BridgeEmulatorRequest);
          });
        });
      } else {
        const body = await new Promise<Buffer>((resolve, reject) => {
          const acc: Buffer[] = [];
          req.on("data", (chunk: Buffer) => {
            acc.push(chunk);
          });
          req.on("end", () => {
            resolve(Buffer.concat(acc));
          });
          req.on("error", reject);
        });
        json = JSON.parse(
          body.toString("utf-8") || "{}",
        ) as BridgeEmulatorRequest;
      }

      if (json.cmd === "ack") {
        const waiting = this.waitingAck.get(json.testId);
        if (waiting) {
          waiting.finally(() => {
            if ("testId" in json) {
              this.waitingAck.delete(json.testId);
            }
            res.writeHead(200, "OK", { "X-Server": "bridge" });
            res.write("{}");
            res.end();
          });
        } else {
          res.writeHead(404, "Not Found", { "X-Server": "bridge" });
          res.end();
        }
        return;
      }
      if (json.cmd === "echo") {
        const fetchHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              for (const v of value) {
                fetchHeaders.append(key, v);
              }
            } else {
              fetchHeaders.set(key, value);
            }
          }
        }
        const fetchReq = new Request(
          `http://${req.headers.host || ""}${req.url || ""}`,
          { headers: fetchHeaders },
        );
        this.fetches.push(fetchReq);
        res.writeHead(200, "OK", { "X-Server": "bridge" });
        res.write(JSON.stringify(json.data));
        res.end();
        return;
      }
      if (json.cmd === "status") {
        res.writeHead(parseInt(json.data.status), "", { "X-Server": "bridge" });
        res.write(JSON.stringify(json.data));
        res.end();
        return;
      }
      if (json.cmd === "reportSpans") {
        res.writeHead(204, "OK", { "X-Server": "bridge" });
        res.end();
        this.reportedSpans.push(json.data);
        return;
      }

      res.writeHead(400, "Bad request", { "X-Server": "bridge" });
      res.end();
    };

    const server = new Server((req, res) => {
      void handler(req, res);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.listen(0, (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error(`Failed to connect a bridge server`);
      }
      this.port = address.port;
      this.server = server;
    } catch (e) {
      server.close();
      this.server = undefined;
      throw e;
    }
  }

  reset(): void {
    this.fetches = [];
  }

  close(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }

  async fetch(input: string, init?: RequestInit): Promise<Response> {
    const url = new URL(input, `http://127.0.0.1:${this.serverPort}`);
    const testId = Math.random().toString(36).slice(2);
    let waitingResolve: (v: unknown) => void = () => undefined;
    const waiting = new Promise<unknown>((resolve) => {
      waitingResolve = resolve;
    });
    this.waitingAck.set(testId, waiting);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          "x-client": "bridge",
          "x-vercel-id": "request1",
          "x-otel-test-id": testId,
          "x-otel-test-url": input,
          "x-otel-test-bridge-port": String(this.port),
          ...(this.traceDrains
            ? { "x-otel-test-trace-drains": this.traceDrains.join(",") }
            : undefined),
        },
      });
      const resClone = res.clone();
      await res.arrayBuffer();
      return resClone;
    } finally {
      waitingResolve(undefined);
    }
  }
}
