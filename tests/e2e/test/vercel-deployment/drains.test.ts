import { expect, it } from "vitest";
import { describe } from "../../lib/with-bridge";

describe(
  "vercel deployment: drains",
  {
    bridge: {
      traceDrains: ["traceful.dev"],
    },
  },
  (props) => {
    it("should NOT output traces", async () => {
      const { collector, bridge } = props();

      const execResp = await bridge.fetch("/slugs/baz");
      expect(execResp.status).toBe(200);

      // Wait to make sure no spans are reported.
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      expect(collector.getAllTraces()).toHaveLength(0);

      // Instead the spans should be available via `reportSpans`.
      expect(bridge.reportedSpans.length).toBeGreaterThan(0);

      /* eslint-disable @typescript-eslint/no-explicit-any -- only testing that Rusty calls are being made */
      /* eslint-disable @typescript-eslint/no-unsafe-member-access -- only testing that Rusty calls are being made */
      /* eslint-disable @typescript-eslint/no-unsafe-assignment -- only testing that Rusty calls are being made */

      let spanCount = 0;
      let foundSpan: object | undefined;
      for (const reportedSpans of bridge.reportedSpans as any[]) {
        for (const resourceSpans of reportedSpans.resourceSpans) {
          for (const scopeSpans of resourceSpans.scopeSpans) {
            for (const span of scopeSpans.spans) {
              spanCount++;
              if (span.name === "GET /slugs/[slug]") {
                foundSpan = span;
                break;
              }
            }
          }
        }
      }

      expect(spanCount).toBeGreaterThan(2);
      expect(foundSpan).toBeDefined();
      expect(foundSpan).toMatchObject({
        name: "GET /slugs/[slug]",
      });

      /* eslint-enable @typescript-eslint/no-explicit-any */
      /* eslint-enable @typescript-eslint/no-unsafe-member-access */
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });
  },
);
