import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  bundle: true,
  minify: false,
  sourcemap: true,
  clean: true,
  dts: false,
});
