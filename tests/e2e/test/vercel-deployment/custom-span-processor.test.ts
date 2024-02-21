import { expect, it } from "vitest";
import { describe } from "../../lib/with-bridge";
import { expectStdio } from "../../lib/expect-stdio";

describe(
  "vercel deployment: custom span processor",
  {
    env: {
      TEST_SPAN_PROCESSOR: "console",
    },
  },
  (props) => {
    it("should trace render for serverless", async () => {
      const { collector, bridge, stdio } = props();

      const execResp = await bridge.fetch("/slugs/baz");
      expect(execResp.status).toBe(200);

      await expectStdio(stdio.out, "name: 'GET /slugs/[slug]'");
      expect(collector.getAllTraces().length).toBe(0);
    });

    it("should trace render for edge", async () => {
      const { collector, bridge, stdio } = props();

      const execResp = await bridge.fetch("/slugs/baz/edge");
      expect(execResp.status).toBe(200);

      await expectStdio(stdio.out, "name: 'GET /slugs/[slug]/edge'");
      expect(collector.getAllTraces().length).toBe(0);
    });
  }
);
