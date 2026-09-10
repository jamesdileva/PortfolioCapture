import { build } from "esbuild";
import { rmSync, cpSync } from "fs";

rmSync("apps/desktop/electron/dist", { recursive: true, force: true });

const esmBanner = [
  "import { fileURLToPath as __efu } from 'node:url';",
  "import { dirname as __edirname } from 'node:path';",
  "import { createRequire as __creq } from 'node:module';",
  "const __filename = __efu(import.meta.url);",
  "const __dirname = __edirname(__filename);",
  "const require = __creq(import.meta.url);",
  "const __electron = require('electron');",
  "const __betterSqlite3 = require('better-sqlite3');",
].join("\n");

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

const nativeModulePlugin = {
  name: "native-modules-to-banner",
  setup(build) {
    const externals = {
      "electron": "__electron",
      "better-sqlite3": "__betterSqlite3",
    };

    for (const [mod, globalName] of Object.entries(externals)) {
      const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      build.onResolve({ filter: new RegExp(`^${escaped}$`) }, (args) => ({
        path: args.path,
        namespace: "native-module-ns",
      }));
      build.onLoad({ filter: /.*/, namespace: "native-module-ns" }, (args) => {
        if (args.path === "electron") {
          return {
            contents: [
              `const mod = ${globalName};`,
              `export default mod;`,
              `export const app = mod.app;`,
              `export const BrowserWindow = mod.BrowserWindow;`,
              `export const dialog = mod.dialog;`,
              `export const ipcMain = mod.ipcMain;`,
              `export const shell = mod.shell;`,
              `export const globalShortcut = mod.globalShortcut;`,
            ].join("\n"),
            loader: "js",
          };
        }
        return {
          contents: `export default ${globalName};`,
          loader: "js",
        };
      });
    }
  },
};

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
};

await Promise.all([
  build({
    ...shared,
    format: "esm",
    plugins: [nativeModulePlugin],
    entryPoints: ["apps/desktop/electron/main.ts"],
    outfile: "apps/desktop/electron/dist/main.mjs",
    banner: { js: esmBanner },
  }),
  build({
    ...shared,
    format: "cjs",
    entryPoints: ["apps/desktop/electron/preload.ts"],
    outfile: "apps/desktop/electron/dist/preload.js",
    banner: { js: cjsBanner },
  }),
]);

cpSync("packages/database/migrations", "apps/desktop/electron/dist/migrations", { recursive: true });

console.log("Electron build complete: dist/main.mjs + dist/preload.js + migrations/");
