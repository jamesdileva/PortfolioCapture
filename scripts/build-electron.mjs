import { build } from "esbuild";
import { rmSync, cpSync } from "fs";

rmSync("apps/desktop/electron/dist", { recursive: true, force: true });

const cjsBanner = [
  "var fs = require('fs'), path = require('path');",
  "var _logDir;",
  "try { _logDir = path.join(require('electron').app.getPath('userData'), 'logs'); } catch(_) { _logDir = path.join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'portfolio-auto-recorder'); }",
  "try { fs.mkdirSync(_logDir, { recursive: true }); } catch(_) {}",
  "var _logFile = path.join(_logDir, 'startup.log');",
  "var _logFileExe = null; try { _logFileExe = path.join(path.dirname(process.execPath), 'startup.log'); } catch(_) {}",
  "function _logStartup(msg) { try { var t = new Date().toISOString(); var line = t + ' [main] ' + msg + String.fromCharCode(10); try { fs.appendFileSync(_logFile, line); } catch(_) {} try { if (_logFileExe && _logFileExe !== _logFile) fs.appendFileSync(_logFileExe, line); } catch(_) {} } catch(_) {} }",
  "try { _logStartup('EXE_IDENTITY: execPath=' + process.execPath + ' argv0=' + (process.argv && process.argv[0] || '?') + ' resources=' + (process.resourcesPath || '?') + ' marker=post-f84534f-banner-dualwrite'); } catch(_) {}",
  "try { var _st = fs.statSync(__filename); _logStartup('MAINJS_MTIME: mtime=' + _st.mtime.toISOString() + ' size=' + _st.size); } catch(_) {}",
  "try { var _eMod = require('electron'); _logStartup('ELECTRON_MODULE: keys=' + Object.keys(_eMod).join(',') + ' typeof_app=' + typeof _eMod.app + ' typeof_BrowserWindow=' + typeof _eMod.BrowserWindow + ' typeof_dialog=' + typeof _eMod.dialog + ' typeof_ipcMain=' + typeof _eMod.ipcMain + ' typeof_shell=' + typeof _eMod.shell); } catch(_e) { _logStartup('ELECTRON_MODULE_ERROR: ' + (_e.stack || _e.message || String(_e))); }",
  "process.on('uncaughtException', function(err) {",
  "  _logStartup('UNCAUGHT EXCEPTION: ' + (err.stack || err.message || String(err)));",
  "  console.error('UNCAUGHT EXCEPTION:', err);",
  "  try {",
  "    var dialog = require('electron').dialog;",
  "    if (dialog && dialog.showErrorBox) dialog.showErrorBox('Portfolio Auto Recorder \\u2014 Fatal Error', (err.stack || err.message || String(err)));",
  "  } catch(_) { console.error('Could not show error dialog:', err); }",
  "  process.exit(1);",
  "});",
  "process.on('unhandledRejection', function(err) {",
  "  _logStartup('UNHANDLED REJECTION: ' + (err && err.stack ? err.stack : String(err)));",
  "  console.error('UNHANDLED REJECTION:', err);",
  "  try {",
  "    var dialog = require('electron').dialog;",
  "    var msg = (err && err.stack) ? err.stack : (err ? String(err) : 'Unknown error');",
  "    if (dialog && dialog.showErrorBox) dialog.showErrorBox('Portfolio Auto Recorder \\u2014 Fatal Error', msg);",
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
