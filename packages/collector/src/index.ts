import { Server } from "./server";
import {
  createCollectorHandlers,
  getServiceMap,
  resetStore,
  getAllTraces,
  processResourceSpans,
} from "./store";

export type { ITrace } from "./store";

export interface OtelCollectorOptions {
  port?: number;
}

export interface OtelCollector {
  port: number;
  close: () => void;
  reset: () => void;
  getAllTraces: typeof getAllTraces;
  getServiceMap: typeof getServiceMap;
  processResourceSpans: typeof processResourceSpans;
}

export async function start(
  opts?: OtelCollectorOptions,
): Promise<OtelCollector> {
  const server = new Server();
  server.addHandlers(createCollectorHandlers());
  await server.connect(opts?.port ?? 0);
  return {
    port: server.port,
    reset: resetStore,
    close: (): void => {
      server.close();
      resetStore();
    },
    getServiceMap,
    getAllTraces,
    processResourceSpans,
  };
}
