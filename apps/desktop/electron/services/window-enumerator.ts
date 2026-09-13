import { exec } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { WindowInfo } from "../../../../packages/shared/types/index.js";

export type ExecFn = (command: string) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFn = (command) =>
  new Promise((resolve, reject) => {
    exec(command, { encoding: "utf-8", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });

/** PowerShell script that enumerates visible titled windows as JSON. Exported for testing. */
export function buildWindowListScript(): string {
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$script:windows = @()
$callback = [WinAPI+EnumWindowsProc]{
    param($hWnd, $lParam)
    if ([WinAPI]::IsWindowVisible($hWnd)) {
        $len = [WinAPI]::GetWindowTextLength($hWnd)
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder ($len + 1)
            [WinAPI]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
            $title = $sb.ToString()
            if ($title -and $title.Trim().Length -gt 0) {
                $procId = 0
                [WinAPI]::GetWindowThreadProcessId($hWnd, [ref]$procId) | Out-Null
                $script:windows += [PSCustomObject]@{
                    Title = $title
                    Pid = $procId
                    Hwnd = "0x{0:X}" -f $hWnd.ToInt64()
                }
            }
        }
    }
    return $true
}
[WinAPI]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
$script:windows | ConvertTo-Json -Compress
`;
}

export class WindowEnumeratorImpl {
  private execFn: ExecFn;

  constructor(execFn?: ExecFn) {
    this.execFn = execFn ?? defaultExec;
  }

  async listWindows(): Promise<WindowInfo[]> {
    const psScript = buildWindowListScript();

    // Written to a temp .ps1 file and run via -File: embedding the script in a
    // -Command string would require flattening newlines, which breaks the
    // @"..."@ here-strings, and nested quoting is fragile. One quoted -File
    // path argument is the only shell quoting involved.
    const tmpFile = join(tmpdir(), `par-windows-${randomUUID()}.ps1`);
    try {
      writeFileSync(tmpFile, psScript, "utf-8");
      const { stdout } = await this.execFn(
        `powershell -NoProfile -NonInteractive -File "${tmpFile}"`,
      );

      const parsed = JSON.parse(stdout.trim());
      const windows = Array.isArray(parsed) ? parsed : [parsed];

      return windows
        .filter((w: { Title?: string }) => w.Title && w.Title.trim().length > 0)
        .map((w: { Title: string; Pid: number; Hwnd: string }) => ({
          title: w.Title,
          pid: w.Pid,
          hwnd: w.Hwnd,
        }));
    } catch {
      return [];
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // best-effort temp cleanup (also covers mocked execFn in tests)
      }
    }
  }
}
