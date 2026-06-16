import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    "manifest/index": "src/manifest/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "providers/index": "src/providers/index.ts",
    "tools/index": "src/tools/index.ts",
    "memory/index": "src/memory/index.ts",
    "server/index": "src/server/index.ts",
  },
  format: ["esm"],
  target: "node20",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  shims: {
    dotenv: true,
  },
  banner: {
    js: "/*! gitagent — github.com/10xdev4u-alt/gitagent */",
  },
});
