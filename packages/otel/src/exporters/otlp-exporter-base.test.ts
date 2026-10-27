import { afterEach, describe, expect, it, vi } from "vitest";
import { diag } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import { OTLPExporterEdgeBase } from "./otlp-exporter-base";

class TestExporter extends OTLPExporterEdgeBase<string, string[]> {
  convert(items: string[]): string[] {
    return items;
  }
  getDefaultUrl(): string {
    return "http://localhost:4318/v1/traces";
  }
  toMessage(items: string[]): { body: string; contentType: string } {
    return { body: items.join(","), contentType: "text/plain" };
  }
}

function exportOnce(exporter: TestExporter): Promise<ExportResult> {
  return new Promise((resolve) => {
    exporter.export(["span"], resolve);
  });
}

function stubHangingFetch(): void {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
    ),
  );
}

async function timeoutMessage(
  exporter: TestExporter,
): Promise<string | undefined> {
  const pending = exportOnce(exporter);
  await vi.advanceTimersByTimeAsync(2 ** 31);
  return (await pending).error?.message;
}

describe("OTLPExporterEdgeBase", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports failure when exporting after shutdown", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exporter = new TestExporter();
    await exporter.shutdown();

    const result = await exportOnce(exporter);

    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports failure when serialization throws", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exporter = new TestExporter();
    vi.spyOn(exporter, "toMessage").mockImplementation(() => {
      throw new Error("boom");
    });

    const result = await exportOnce(exporter);

    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(result.error?.message).toBe("boom");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts requests that exceed timeoutMillis", async () => {
    stubHangingFetch();
    const exporter = new TestExporter({ timeoutMillis: 1000 });

    const pending = exportOnce(exporter);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(result.error?.message).toBe("Export timed out after 1000ms");
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });

  it.each([0, -1, NaN, Infinity])(
    "falls back to the default timeout when timeoutMillis is %s",
    async (timeoutMillis) => {
      stubHangingFetch();
      const warn = vi.spyOn(diag, "warn");

      const message = await timeoutMessage(new TestExporter({ timeoutMillis }));

      expect(message).toBe("Export timed out after 10000ms");
      expect(warn).toHaveBeenCalledWith(
        `@vercel/otel/otlp: ignoring invalid timeoutMillis: ${timeoutMillis}`,
      );
    },
  );

  it("clamps timeoutMillis to the largest delay setTimeout supports", async () => {
    stubHangingFetch();

    const message = await timeoutMessage(
      new TestExporter({ timeoutMillis: 2 ** 31 }),
    );

    expect(message).toBe(`Export timed out after ${2 ** 31 - 1}ms`);
  });

  it("reads the timeout from OTEL_EXPORTER_OTLP_TRACES_TIMEOUT", async () => {
    stubHangingFetch();
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT", "250");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TIMEOUT", "500");

    const message = await timeoutMessage(new TestExporter());

    expect(message).toBe("Export timed out after 250ms");
  });

  it("falls through an invalid OTEL_EXPORTER_OTLP_TRACES_TIMEOUT to OTEL_EXPORTER_OTLP_TIMEOUT", async () => {
    stubHangingFetch();
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT", "abc");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TIMEOUT", "20");
    const warn = vi.spyOn(diag, "warn");

    const message = await timeoutMessage(new TestExporter());

    expect(message).toBe("Export timed out after 20ms");
    expect(warn).toHaveBeenCalledWith(
      "@vercel/otel/otlp: ignoring invalid OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: abc",
    );
  });

  it("prefers a valid timeoutMillis over the environment", async () => {
    stubHangingFetch();
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT", "250");

    const message = await timeoutMessage(
      new TestExporter({ timeoutMillis: 40 }),
    );

    expect(message).toBe("Export timed out after 40ms");
  });
});
