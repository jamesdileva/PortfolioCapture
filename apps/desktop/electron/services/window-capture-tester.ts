import { spawn, execFile, type ChildProcess } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { WindowInfo, WindowEnumerator, WindowCaptureTestResult } from "../../../../packages/shared/types/index.js";

export interface WindowCaptureTesterOptions {
  windowEnumerator: WindowEnumerator;
  ffmpegPath?: string;
  spawnFn?: (command: string, args: string[]) => ChildProcess;
  execFileFn?: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  tmpDir?: string;
  unlinkFn?: (path: string) => void;
  existsFn?: (path: string) => boolean;
}

/** YAVG at or above this means the picture is (near-)pure white. */
export const BLANK_BRIGHTNESS_THRESHOLD = 240;

function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Average frame brightness (0-255 luma) of a video file, or null when unmeasurable. */
export async function sampleVideoBrightness(
  execFileFn: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>,
  ffmpegPath: string,
  videoPath: string,
): Promise<number | null> {
  try {
    const { stdout } = await execFileFn(ffmpegPath, [
      "-v", "info",
      "-i", videoPath,
      "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
      "-f", "null", "-",
    ]);
    const values: number[] = [];
    for (const match of stdout.matchAll(/YAVG=([\d.]+)/g)) {
      const n = parseFloat(match[1]);
      if (!isNaN(n)) values.push(n);
    }
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  } catch {
    return null;
  }
}

export class WindowCaptureTester {
  private windowEnumerator: WindowEnumerator;
  private ffmpegPath: string;
  private spawnFn: (command: string, args: string[]) => ChildProcess;
  private execFileFn: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  private tmpDir: string;
  private unlinkFn: (path: string) => void;
  private existsFn: (path: string) => boolean;

  constructor(options: WindowCaptureTesterOptions) {
    this.windowEnumerator = options.windowEnumerator;
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.spawnFn = options.spawnFn ?? ((command, args) => spawn(command, args));
    this.execFileFn = options.execFileFn ?? defaultExecFile;
    this.tmpDir = options.tmpDir ?? tmpdir();
    this.unlinkFn = options.unlinkFn ?? ((p) => unlinkSync(p));
    this.existsFn = options.existsFn ?? ((p) => existsSync(p));
  }

  async testCapture(title: string, seconds = 3): Promise<WindowCaptureTestResult> {
    const needle = title.trim().toLowerCase();
    if (!needle) {
      return { ok: false, brightness: null, message: "Enter a window title first" };
    }

    let windows: WindowInfo[];
    try {
      windows = await this.windowEnumerator.listWindows();
    } catch (err) {
      return { ok: false, brightness: null, message: `Could not list windows: ${err instanceof Error ? err.message : String(err)}` };
    }
    const live =
      windows.find((w) => w.title.toLowerCase() === needle) ??
      windows.find((w) => w.title.toLowerCase().includes(needle));
    if (!live) {
      return { ok: false, brightness: null, message: `Window "${title.trim()}" is not open` };
    }

    const outPath = join(this.tmpDir, `par-testcap-${Date.now()}.mp4`);
    const { exitCode, stderr } = await this.runCapture(live.title, outPath, seconds);
    try {
      if (exitCode !== 0 || !this.existsFn(outPath)) {
        const tail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 300);
        return { ok: false, brightness: null, message: `Capture failed (ffmpeg exit ${exitCode})${tail ? `: ${tail}` : ""}` };
      }

      const brightness = await sampleVideoBrightness(this.execFileFn, this.ffmpegPath, outPath);
      if (brightness != null && brightness >= BLANK_BRIGHTNESS_THRESHOLD) {
        return {
          ok: false,
          brightness,
          message: `Captured "${live.title}" but it looks blank (brightness ${Math.round(brightness)}). GPU-rendered windows (browsers, Electron, Unity) need full-desktop mode.`,
        };
      }
      const detail = brightness != null ? ` (brightness ${Math.round(brightness)})` : "";
      return { ok: true, brightness, message: `Captured "${live.title}" OK${detail}` };
    } finally {
      try {
        this.unlinkFn(outPath);
      } catch {
        // best-effort temp cleanup
      }
    }
  }

  private runCapture(title: string, outputPath: string, seconds: number): Promise<{ exitCode: number; stderr: string }> {
    return new Promise((resolve) => {
      let proc: ChildProcess;
      try {
        proc = this.spawnFn(this.ffmpegPath, [
          "-y",
          "-f", "gdigrab",
          "-framerate", "5",
          "-i", `title=${title}`,
          "-t", String(seconds),
          "-vf", "scale=640:-1",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          "-an",
          outputPath,
        ]);
      } catch (err) {
        resolve({ exitCode: -1, stderr: err instanceof Error ? err.message : String(err) });
        return;
      }

      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 8192) stderr = stderr.slice(-8192);
      });
      const done = (code: number) => resolve({ exitCode: code, stderr });
      proc.on("error", () => done(-1));
      proc.on("close", (code) => done(code ?? -1));
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        done(-1);
      }, (seconds + 10) * 1000);
    });
  }
}
