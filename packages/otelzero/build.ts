import { stat } from "node:fs/promises";
import { build } from "esbuild";

const MINIFY = true;
const SOURCEMAP = true;

const MAX_SIZES = {
  "dist/index.js": 3_500,
};

async function buildAll(): Promise<void> {
  await Promise.all([
    build({
      target: "esnext",
      format: "esm",
      splitting: false,
      entryPoints: ["src/index.ts"],
      outdir: "dist",
      bundle: true,
      minify: MINIFY,
      sourcemap: SOURCEMAP,
    }),
  ]);

  // Check max size.
  const errors: string[] = [];
  for (const [file, maxSize] of Object.entries(MAX_SIZES)) {
    // eslint-disable-next-line no-await-in-loop
    const s = await stat(file);
    if (s.size > maxSize) {
      errors.push(
        `${file}: the size of ${s.size} is over the maximum allowed size of ${maxSize}`
      );
    }
  }
  if (errors.length > 0) {
    for (const error of errors) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    process.exit(1);
  }
}

void buildAll();
