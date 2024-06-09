import { stat } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { build } from "esbuild";

const MINIFY = true;
const SOURCEMAP = false;

type ExternalPluginFactory = (external: string[]) => Plugin;
const externalCjsToEsmPlugin: ExternalPluginFactory = (external) => ({
  name: "external",
  setup(builder): void {
    const escape = (text: string): string =>
      `^${text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`;
    const filter = new RegExp(external.map(escape).join("|"));
    builder.onResolve({ filter: /.*/, namespace: "external" }, (args) => ({
      path: args.path,
      external: true,
    }));
    builder.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "external",
    }));
    builder.onLoad({ filter: /.*/, namespace: "external" }, (args) => ({
      contents: `export * from ${JSON.stringify(args.path)}`,
    }));
  },
});

// On Edge `eval()` is not allowed. Strip it from the input sources.
const stripEvalEdge: Plugin = {
  name: "stripEvalEdge",
  setup(builder): void {
    builder.onLoad({ filter: /@protobufjs\/inquire\/index\.js/ }, () => {
      return {
        contents: `
          "use strict";
          module.exports = inquire;
          function inquire(moduleName) {
            return null;
          }
        `,
      };
    });
  },
};

/** Adds support for require, __filename, and __dirname to ESM / Node. */
const esmNodeSupportBanner = {
  js: `import { fileURLToPath } from 'url';
import { createRequire as topLevelCreateRequire } from 'module';
import _nPath from 'path'
const require = topLevelCreateRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = _nPath.dirname(__filename);`,
};

async function buildAll(): Promise<void> {
  await Promise.all([
    build({
      target: "esnext",
      format: "esm",
      splitting: false,
      entryPoints: ["src/api.ts"],
      outdir: "dist/api",
      bundle: true,
      minify: MINIFY,
      sourcemap: SOURCEMAP,
      // banner: edgeSupportBanner,
      // external: ["@opentelemetry/api"],
      plugins: [
        // externalCjsToEsmPlugin(["async_hooks", "events"]),
        // stripEvalEdge,
      ],
    }),
    build({
      target: "esnext",
      format: "esm",
      splitting: false,
      entryPoints: ["src/via-otel-api.ts"],
      outdir: "dist/via-otel-api",
      bundle: true,
      minify: MINIFY,
      sourcemap: SOURCEMAP,
      // banner: edgeSupportBanner,
      // external: ["@opentelemetry/api"],
      plugins: [
        // externalCjsToEsmPlugin(["async_hooks", "events"]),
        // stripEvalEdge,
      ],
    }),
    build({
      target: "esnext",
      format: "esm",
      splitting: false,
      entryPoints: ["src/via-otel-sdk.ts"],
      outdir: "dist/via-otel-sdk",
      bundle: true,
      minify: MINIFY,
      sourcemap: SOURCEMAP,
      // banner: edgeSupportBanner,
      // external: ["@opentelemetry/api"],
      plugins: [
        // externalCjsToEsmPlugin(["async_hooks", "events"]),
        // stripEvalEdge,
      ],
    }),
    build({
      target: "esnext",
      format: "esm",
      splitting: false,
      entryPoints: ["src/otel-api.ts"],
      outdir: "dist/otel-api",
      bundle: true,
      minify: MINIFY,
      sourcemap: SOURCEMAP,
      // banner: edgeSupportBanner,
      // external: ["@opentelemetry/api"],
      plugins: [
        // externalCjsToEsmPlugin(["async_hooks", "events"]),
        // stripEvalEdge,
      ],
    }),
  ]);
}

void buildAll();
