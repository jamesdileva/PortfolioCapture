# Terminal Launch — Portfolio Auto Recorder (win-unpacked)

Use this when double-clicking the `.exe` shows nothing (silent fail).
Terminal launch surfaces stderr that double-click hides.

## 1. Launch from terminal

```powershell
cd C:\Users\j\Projects\PortfolioCapture\dist\win-unpacked
.\'Portfolio Auto Recorder.exe' --no-sandbox
```

- Keep the terminal open — copy ALL output (stderr) even if the window never appears.
- `--no-sandbox` avoids Electron sandbox permission failures on some Windows setups.
- Alternative (installed version):
  ```powershell
  & "$env:LOCALAPPDATA\Programs\Portfolio Auto Recorder\Portfolio Auto Recorder.exe" --no-sandbox
  ```

## 2. Startup logs (dual-write since diag commits)

| Location | Path |
|---|---|
| Exe-adjacent (works even if userData fails) | `dist\win-unpacked\startup.log` |
| userData (full detail) | `%APPDATA%\portfolio-auto-recorder\logs\startup.log` |

The log stops at `calling new Database() next` with nothing after = crash
inside `new Database()` native call (no JS exception). Report the last
10 lines of BOTH log files.

## 3. DB file

- Active DB: `%APPDATA%\portfolio-auto-recorder\portfoliodb.sqlite`
  (renamed from `database.sqlite` 2026-09-12 to isolate the 0-byte-file lock hypothesis).
- If `portfoliodb.sqlite` is 0 bytes after a launch, the native module
  created the file then aborted before writing the SQLite header.
- Do NOT delete `%APPDATA%\portfolio-auto-recorder\database.sqlite`
  yet — it is evidence for the 0-byte comparison.

## 4. Event Viewer (if no stderr and no new log lines)

1. `Win + R` → `eventvwr` → Windows Logs → Application.
2. Look for Error entries with source `Application Error` at the launch time.
3. Report: faulting module name (e.g. `better_sqlite3.node`, `electron.exe`),
   exception code, and fault offset.

## 5. What to paste back

1. Terminal stderr (full text).
2. Last 10 lines of exe-adjacent `startup.log`.
3. Last 10 lines of `%APPDATA%\portfolio-auto-recorder\logs\startup.log`.
4. `dir %APPDATA%\portfolio-auto-recorder\*.sqlite` (sizes — 0 bytes vs non-zero decides the DB-lock hypothesis).
5. Event Viewer faulting module (if any).
