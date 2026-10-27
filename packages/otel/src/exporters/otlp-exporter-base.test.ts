import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("OTLPExporterEdgeBase", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    const exporter = new TestExporter({ timeoutMillis: 1000 });

    const pending = exportOnce(exporter);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(result.error?.message).toBe("Export timed out after 1000ms");
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });

  it("reads the timeout from OTEL_EXPORTER_OTLP_TRACES_TIMEOUT", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT", "250");
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const exporter = new TestExporter();

    const pending = exportOnce(exporter);
    await vi.advanceTimersByTimeAsync(250);
    const result = await pending;

    expect(result.code).toBe(ExportResultCode.FAILED);
  });
});
