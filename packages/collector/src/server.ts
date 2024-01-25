import {
  Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export type IHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

export class Server {
  public port = -1;
  private server: HttpServer | undefined;
  private handlers: IHandler[] = [];

  async connect(port: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const server = new HttpServer(async (req, res) => {
      const handlers = this.handlers.slice(0);
      for (const handler of handlers) {
        // eslint-disable-next-line no-await-in-loop -- important to await each handler to respect the order.
        await handler(req, res);
        if (res.headersSent || res.writableEnded) {
          break;
        }
      }
      if (!(res.headersSent || res.writableEnded)) {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.listen(port, (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error(`Failed to connect a collector server on port ${port}`);
      }
      this.port = address.port;
      this.server = server;
    } catch (e) {
      server.close();
      this.server = undefined;
      this.port = -1;
      throw e;
    }
  }

  close(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
      this.port = -1;
    }
  }

  addHandler(handler: IHandler): void {
    this.handlers.push(handler);
  }

  addHandlers(handlers: IHandler[]): void {
    this.handlers.push(...handlers);
  }
}
