import { defineConfig } from "tsup";

export default defineConfig({
  tsconfig: "tsconfig.build.json",
  entry: [
    "src/index.ts",
    "src/wallet/index.ts",
    "src/x402-exact/index.ts",
    "src/solana-agent-kit/index.ts",
  ],
  format: ["cjs", "esm"],
  dts: { compilerOptions: { noUnusedLocals: false, noUnusedParameters: false } },
  clean: true,
  // Sourcemaps in dev builds; omitted from the published (prod) bundle to keep
  // the npm tarball lean — set TSUP_SOURCEMAP=false (see the build:prod script).
  sourcemap: process.env.TSUP_SOURCEMAP !== "false",
  splitting: false,
});
