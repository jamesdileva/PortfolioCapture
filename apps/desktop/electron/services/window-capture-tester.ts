import { execFile } from "child_process";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { WindowInfo, WindowEnumerator, WindowCaptureTestResult, CaptureProvider } from "../../../../packages/shared/types/index.js";

export interface WindowCaptureTesterOptions {
  windowEnumerator: WindowEnumerator;
  captureProvider: CaptureProvider;
  brightnessSampler?: (videoPath: string) => Promise<number | null>;
  tmpDir?: string;
  unlinkFn?: (path: string) => void;
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

export function defaultBrightnessSampler(videoPath: string): Promise<number | null> {
  return sampleVideoBrightness(defaultExecFile, "ffmpeg", videoPath);
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
  private captureProvider: CaptureProvider;
  private brightnessSampler: (videoPath: string) => Promise<number | null>;
  private tmpDir: string;
  private unlinkFn: (path: string) => void;

  constructor(options: WindowCaptureTesterOptions) {
    this.windowEnumerator = options.windowEnumerator;
    this.captureProvider = options.captureProvider;
    this.brightnessSampler = options.brightnessSampler ?? defaultBrightnessSampler;
    this.tmpDir = options.tmpDir ?? tmpdir();
    this.unlinkFn = options.unlinkFn ?? ((p) => unlinkSync(p));
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
    try {
      let sessionId: string;
      try {
        const session = await this.captureProvider.start({
          outputPath: outPath,
          fps: 15,
          width: 1280,
          height: 720,
          audio: "none",
          captureMode: "window",
          windowTitle: live.title,
        });
        sessionId = session.sessionId;
      } catch (err) {
        return { ok: false, brightness: null, message: `Capture failed to start: ${err instanceof Error ? err.message : String(err)}` };
      }

      await new Promise((r) => setTimeout(r, Math.max(0, seconds) * 1000));

      try {
        await this.captureProvider.stop(sessionId);
      } catch (err) {
        return { ok: false, brightness: null, message: `Capture failed to stop: ${err instanceof Error ? err.message : String(err)}` };
      }

      const brightness = await this.brightnessSampler(outPath);
      if (brightness != null && brightness >= BLANK_BRIGHTNESS_THRESHOLD) {
        return {
          ok: false,
          brightness,
          message: `Captured "${live.title}" but it looks blank (brightness ${Math.round(brightness)}). Try full-desktop mode for this window.`,
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
}
