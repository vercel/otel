import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 20000,
    teardownTimeout: 10000,
  },
});
