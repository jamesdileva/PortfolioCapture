import { exec } from "child_process";
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

export class WindowEnumeratorImpl {
  private execFn: ExecFn;

  constructor(execFn?: ExecFn) {
    this.execFn = execFn ?? defaultExec;
  }

  async listWindows(): Promise<WindowInfo[]> {
    const psScript = `
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

$windows = @()
$callback = [WinAPI+EnumWindowsProc]{
    param($hWnd, $lParam)
    if ([WinAPI]::IsWindowVisible($hWnd)) {
        $len = [WinAPI]::GetWindowTextLength($hWnd)
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder ($len + 1)
            [WinAPI]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
            $title = $sb.ToString()
            if ($title -and $title.Trim().Length -gt 0) {
                $pid = 0
                [WinAPI]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
                $windows += [PSCustomObject]@{
                    Title = $title
                    Pid = $pid
                    Hwnd = "0x{0:X}" -f $hWnd.ToInt64()
                }
            }
        }
    }
    return $true
}
[WinAPI]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
$windows | ConvertTo-Json -Compress
`;

    try {
      const { stdout } = await this.execFn(
        `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
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
    }
  }
}
