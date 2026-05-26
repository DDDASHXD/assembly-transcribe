import { defineConfig } from "tsup"

const shared = {
  format: ["esm"] as const,
  target: "node18",
  platform: "node" as const,
  external: ["@opentui/core", "assemblyai"],
}

export default defineConfig([
  {
    ...shared,
    entry: ["src/launcher.ts"],
    outDir: "dist",
    clean: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    ...shared,
    entry: ["src/cli.ts"],
    outDir: "dist",
    clean: false,
  },
])
