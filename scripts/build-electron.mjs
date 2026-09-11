import { build } from "esbuild";
import { rmSync, cpSync } from "fs";

rmSync("apps/desktop/electron/dist", { recursive: true, force: true });

const cjsBanner = [
  "var fs = require('fs'), path = require('path');",
  "var _logDir;",
  "try { _logDir = path.join(require('electron').app.getPath('userData'), 'logs'); } catch(_) { _logDir = path.join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'portfolio-auto-recorder'); }",
  "try { fs.mkdirSync(_logDir, { recursive: true }); } catch(_) {}",
  "var _logFile = path.join(_logDir, 'startup.log');",
  "function _logStartup(msg) { try { var t = new Date().toISOString(); fs.appendFileSync(_logFile, t + ' [main] ' + msg + String.fromCharCode(10)); } catch(_) {} }",
  "process.on('uncaughtException', function(err) {",
  "  _logStartup('UNCAUGHT EXCEPTION: ' + (err.stack || err.message || String(err)));",
  "  console.error('UNCAUGHT EXCEPTION:', err);",
  "  try {",
  "    var dialog = require('electron').dialog;",
  "    dialog.showErrorBox('Portfolio Auto Recorder \\u2014 Fatal Error', (err.stack || err.message || String(err)));",
  "  } catch(_) { console.error('Could not show error dialog:', err); }",
  "  process.exit(1);",
  "});",
  "process.on('unhandledRejection', function(err) {",
  "  _logStartup('UNHANDLED REJECTION: ' + (err && err.stack ? err.stack : String(err)));",
  "  console.error('UNHANDLED REJECTION:', err);",
  "  try {",
  "    var dialog = require('electron').dialog;",
  "    var msg = (err && err.stack) ? err.stack : (err ? String(err) : 'Unknown error');",
  "    dialog.showErrorBox('Portfolio Auto Recorder \\u2014 Fatal Error', msg);",
  "  } catch(_) { console.error('Could not show error dialog:', err); }",
  "  process.exit(1);",
  "});",
].join("\n");

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
  external: ["electron", "better-sqlite3"],
};

await Promise.all([
  build({
    ...shared,
    format: "cjs",
    entryPoints: ["apps/desktop/electron/main.ts"],
    outfile: "apps/desktop/electron/dist/main.js",
    banner: { js: cjsBanner },
  }),
  build({
    ...shared,
    format: "cjs",
    entryPoints: ["apps/desktop/electron/preload.ts"],
    outfile: "apps/desktop/electron/dist/preload.js",
  }),
]);

cpSync("packages/database/migrations", "apps/desktop/electron/dist/migrations", { recursive: true });

console.log("Electron build complete: dist/main.js + dist/preload.js + migrations/");
