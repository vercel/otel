import { describe, expect, it } from "vitest";
import { trace, wrapTrace } from "./api";

describe("otel0 API", () => {
  describe("span", () => {
    it("a span without options", () => {
      const value: number = trace("test", () => 42);
      expect(value).toBe(42);
    });

    it("a span with options", () => {
      const value: number = trace(
        "test",
        { attributes: { foo: "bar" } },
        () => 42
      );
      expect(value).toBe(42);
    });

    it("an updated span", () => {
      const value: number = trace(
        "test",
        { attributes: { foo: "bar" } },
        (span) => {
          span.setAttribute("bar", "baz");
          return 42;
        }
      );
      expect(value).toBe(42);
    });
  });

  describe("wrapSpan", () => {
    it("a span without options", () => {
      const fn = wrapTrace("test", () => 42);
      const value: number = fn();
      expect(value).toBe(42);
    });

    it("a span with options", () => {
      const fn = wrapTrace("test", { attributes: { foo: "bar" } }, () => 42);
      const value: number = fn();
      expect(value).toBe(42);
    });
  });
});
