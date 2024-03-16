import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe as viDescribe,
} from "vitest";
import type { Bridge } from "bridge-emulator/client";
import { start as startBridge } from "bridge-emulator/client";
import type { OtelCollector, OtelCollectorOptions } from "collector";
import { start as startCollector } from "collector";

export interface DescribeProps {
  port: number;
  collector: OtelCollector;
  bridge: Bridge;
  stdio: {
    out: string[];
    err: string[];
  };
}

interface DescribeOptions {
  env?: Record<string, string>;
  collector?: OtelCollectorOptions;
}

export function describe(
  name: string,
  opts: DescribeOptions,
  fn: (props: () => DescribeProps) => void
): ReturnType<typeof viDescribe> {
  return viDescribe(name, () => {
    let port: number;
    let childProcess: ChildProcess;
    let collector: OtelCollector;
    let bridge: Bridge;
    let stdio: DescribeProps["stdio"];
    let prevEnv: Record<string, string | undefined>;

    beforeAll(async () => {
      port = 30000 + Math.floor(Math.random() * 10000);
      collector = await startCollector(opts.collector);
      bridge = await startBridge({ serverPort: port });
      if (!process.env.OTEL_LOG_LEVEL) {
        process.env.OTEL_LOG_LEVEL = "info";
      }
      const env = {
        OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/json",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://localhost:${collector.port}/v1/traces`,
        VERCEL_ENV: "test",
        TEST_PROD: process.env.TEST_PROD || "false",
        ...opts.env,
      };
      prevEnv = {};
      for (const [key, value] of Object.entries(env)) {
        prevEnv[key] = process.env[key];
        process.env[key] = value;
      }
      const prodTest = env.TEST_PROD === "true";
      stdio = { out: [], err: [] };
      childProcess = await execStart(
        "pnpm",
        ["--filter", "sample", prodTest ? "start" : "dev", "--port", `${port}`],
        stdio
      );
      await new Promise<void>((resolve) => {
        const schedule = (): void => {
          setTimeout(() => {
            void (async (): Promise<void> => {
              const resp = await Promise.race([
                fetch(`http://127.0.0.1:${port}/vercel.svg`).catch(
                  () => undefined
                ),
                new Promise<undefined>((r) => {
                  setTimeout(() => r(undefined), 100);
                }),
              ]);
              if (resp?.status === 200) {
                resolve();
              } else {
                schedule();
              }
            })();
          }, 200);
        };
        schedule();
      });
    });

    afterAll(async () => {
      collector.close();
      bridge.close();

      for (const [key, value] of Object.entries(prevEnv)) {
        process.env[key] = value;
      }

      const exitPromise = new Promise<void>((resolve) => {
        childProcess.on("error", (_reason) => {
          resolve();
        });
        childProcess.on("exit", (_code, _signal) => {
          resolve();
        });
      });

      try {
        childProcess.kill();
      } catch (_) {
        // ignore
      }
      await exitPromise;
      try {
        if (!childProcess.killed) {
          childProcess.kill();
        }
      } catch (_) {
        // ignore
      }
    });

    beforeEach(() => {
      bridge.reset();
      collector.reset();
    });

    fn(() => ({ port, collector, bridge, stdio }));
  });
}

async function execStart(
  command: string,
  args: string[],
  stdio: DescribeProps["stdio"]
): Promise<ChildProcess> {
  const child = spawn(command, args, {
    stdio: "pipe",
  });

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (data) => {
    stdio.out.push(String(data));
    // eslint-disable-next-line no-console
    console.log("[server]", data);
  });
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (data) => {
    stdio.err.push(String(data));
    // eslint-disable-next-line no-console
    console.log("[server][error]", data);
  });

  return new Promise((resolve, reject) => {
    child.on("error", (reason) => {
      reject(
        new Error(`${command} failed: ${reason.message}`, { cause: reason })
      );
    });
    child.on("spawn", () => {
      resolve(child);
    });
    child.on("exit", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `${command} failed with code ${String(code)}; signal: ${String(
              signal
            )}`
          )
        );
      } else {
        reject(new Error(`${command} exited unexpectedly with code 0`));
      }
    });
  });
}
