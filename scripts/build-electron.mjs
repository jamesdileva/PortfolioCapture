import { build } from "esbuild";
import { rmSync, cpSync } from "fs";

rmSync("apps/desktop/electron/dist", { recursive: true, force: true });

const errorBanner = `
process.on('uncaughtException', function(err) {
  console.error('UNCAUGHT EXCEPTION:', err);
  try {
    var dialog = require('electron').dialog;
    dialog.showErrorBox('Portfolio Auto Recorder — Fatal Error', (err.stack || err.message || String(err)));
  } catch(_) {
    console.error('Could not show error dialog:', err);
  }
  process.exit(1);
});
process.on('unhandledRejection', function(err) {
  console.error('UNHANDLED REJECTION:', err);
  try {
    var dialog = require('electron').dialog;
    var msg = (err && err.stack) ? err.stack : (err ? String(err) : 'Unknown error');
    dialog.showErrorBox('Portfolio Auto Recorder — Fatal Error', msg);
  } catch(_) {
    console.error('Could not show error dialog:', err);
  }
  process.exit(1);
});
`;

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
    banner: { js: errorBanner },
  }),
  build({
    ...shared,
    entryPoints: ["apps/desktop/electron/preload.ts"],
    outfile: "apps/desktop/electron/dist/preload.js",
    banner: { js: errorBanner },
  }),
]);

cpSync("packages/database/migrations", "apps/desktop/electron/dist/migrations", { recursive: true });

console.log("Electron build complete: dist/main.js + dist/preload.js + migrations/");
