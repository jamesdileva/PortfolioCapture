import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type {
  ForegroundSegment,
  ForegroundTracker,
  ForegroundTrackerConfig,
} from "../../../../packages/shared/types/index.js";

export type RunPsFn = (scriptBody: string) => Promise<string>;
export type ForegroundNowFn = () => number;

export interface ForegroundSnapshot {
  title: string;
  pid: number;
  exePath: string | null;
}

const DEFAULT_CONFIG: ForegroundTrackerConfig = {
  pollIntervalMs: 1000,
};

/** PowerShell snapshot of the foreground window as JSON. Written to a temp
 *  .ps1 file and run via -File: inline -Command strings break @"..."@
 *  here-strings and nested quoting (see window-enumerator). */
export function buildForegroundScript(): string {
  return [
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "using System.Text;",
    "public class FgWinAPI {",
    "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
    "    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "    [DllImport(\"user32.dll\")] public static extern int GetWindowTextLength(IntPtr hWnd);",
    "    [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);",
    "    [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
    "}\"@",
    "$hWnd = [FgWinAPI]::GetForegroundWindow()",
    "$len = [FgWinAPI]::GetWindowTextLength($hWnd)",
    "$sb = New-Object System.Text.StringBuilder ([Math]::Max($len + 1, 1))",
    "[FgWinAPI]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null",
    "$procId = 0",
    "[FgWinAPI]::GetWindowThreadProcessId($hWnd, [ref]$procId) | Out-Null",
    "$exe = $null",
    "try { $exe = (Get-CimInstance Win32_Process -Filter \"ProcessId=$procId\" -ErrorAction Stop).ExecutablePath } catch {}",
    "[PSCustomObject]@{ Title = $sb.ToString(); Pid = $procId; Exe = $exe } | ConvertTo-Json -Compress",
  ].join("\n");
}

function defaultRunPs(scriptBody: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = join(tmpdir(), `par-foreground-${randomUUID()}.ps1`);
    try {
      writeFileSync(file, scriptBody, "utf-8");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-File", file],
      { encoding: "utf-8", maxBuffer: 256 * 1024 },
      (error, stdout, stderr) => {
        try {
          unlinkSync(file);
        } catch {
          // best-effort temp cleanup
        }
        if (error) reject(error);
        else resolve(String(stdout));
      },
    );
  });
}

export function parseForegroundSnapshot(stdout: string): ForegroundSnapshot | null {
  let parsed: { Title?: unknown; Pid?: unknown; Exe?: unknown };
  try {
    parsed = JSON.parse(stdout.trim()) as { Title?: unknown; Pid?: unknown; Exe?: unknown };
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.Title !== "string" || parsed.Title.trim().length === 0) return null;
  const pid = typeof parsed.Pid === "number" ? parsed.Pid : 0;
  return {
    title: parsed.Title,
    pid,
    exePath: typeof parsed.Exe === "string" && parsed.Exe.length > 0 ? parsed.Exe : null,
  };
}

/**
 * Records which window is in the foreground over time. Used to trim the
 * lead-in/tail of manual recordings (app switching), not activity within
 * the demo — pair with the idle timeline for that.
 */
export class ForegroundTrackerImpl implements ForegroundTracker {
  private config: ForegroundTrackerConfig;
  private runPsFn: RunPsFn;
  private nowFn: ForegroundNowFn;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private segments: ForegroundSegment[] = [];
  private current: { title: string; exePath: string | null; startMs: number } | null = null;
  private running = false;

  constructor(config?: Partial<ForegroundTrackerConfig>, runPsFn?: RunPsFn, nowFn?: ForegroundNowFn) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runPsFn = runPsFn ?? defaultRunPs;
    this.nowFn = nowFn ?? (() => Date.now());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollTimer = setInterval(() => {
      this.check().catch(() => {
        // Best-effort sampling; a failed poll just skips one sample.
      });
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.running = false;
    const now = this.nowFn();
    if (this.current && now > this.current.startMs) {
      this.segments.push({
        startMs: this.current.startMs,
        endMs: now,
        title: this.current.title,
        exePath: this.current.exePath,
      });
      this.current = null;
    }
  }

  getSegments(): ForegroundSegment[] {
    return [...this.segments];
  }

  async check(): Promise<void> {
    let snapshot: ForegroundSnapshot | null = null;
    try {
      const stdout = await this.runPsFn(buildForegroundScript());
      snapshot = parseForegroundSnapshot(stdout);
    } catch {
      return;
    }
    if (!snapshot) return;
    const now = this.nowFn();
    if (
      !this.current ||
      this.current.title !== snapshot.title ||
      (this.current.exePath ?? "") !== (snapshot.exePath ?? "")
    ) {
      if (this.current && now > this.current.startMs) {
        this.segments.push({
          startMs: this.current.startMs,
          endMs: now,
          title: this.current.title,
          exePath: this.current.exePath,
        });
      }
      this.current = { title: snapshot.title, exePath: snapshot.exePath, startMs: now };
    }
  }
}
