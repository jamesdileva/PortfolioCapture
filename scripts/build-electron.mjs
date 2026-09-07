import { build } from "esbuild";
import { rmSync, cpSync } from "fs";

rmSync("apps/desktop/electron/dist", { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  external: ["electron", "better-sqlite3"],
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["apps/desktop/electron/main.ts"],
    outfile: "apps/desktop/electron/dist/main.js",
  }),
  build({
    ...shared,
    entryPoints: ["apps/desktop/electron/preload.ts"],
    outfile: "apps/desktop/electron/dist/preload.js",
  }),
]);

cpSync("packages/database/migrations", "apps/desktop/electron/dist/migrations", { recursive: true });

console.log("Electron build complete: dist/main.js + dist/preload.js + migrations/");
