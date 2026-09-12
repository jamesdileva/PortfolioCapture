import { spawn, type ChildProcess } from "child_process";
import { statSync } from "fs";
import type {
  AudioMode,
  CaptureOptions,
  CaptureProvider,
  CaptureResult,
  CaptureSession,
} from "../../../../packages/shared/types/index.js";

export type SpawnFn = (
  command: string,
  args: string[],
) => ChildProcess;

const defaultSpawn: SpawnFn = (command, args) => spawn(command, args);

interface ActiveCapture {
  process: ChildProcess;
  options: CaptureOptions;
  startedAt: string;
  sessionId: string;
}

let sessionCounter = 0;

function generateSessionId(): string {
  sessionCounter++;
  return `capture-${Date.now()}-${sessionCounter}`;
}

export class FfmpegCaptureProvider implements CaptureProvider {
  private activeSessions: Map<string, ActiveCapture> = new Map();
  private spawnFn: SpawnFn;
  private ffmpegPath: string;

  constructor(ffmpegPath = "ffmpeg", spawnFn?: SpawnFn) {
    this.ffmpegPath = ffmpegPath;
    this.spawnFn = spawnFn ?? defaultSpawn;
  }

  async start(options: CaptureOptions): Promise<CaptureSession> {
    const sessionId = generateSessionId();
    const startedAt = new Date().toISOString();

    const args = this.buildArgs(options);

    const process = this.spawnFn(this.ffmpegPath, args);

    return new Promise<CaptureSession>((resolve, reject) => {
      let resolved = false;

      process.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`FFmpeg failed to start: ${err.message}`));
        }
      });

      process.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString();
        if (msg.includes("Output file does not contain any stream")) {
          if (!resolved) {
            resolved = true;
            process.kill();
            reject(new Error("FFmpeg produced no streams"));
          }
        }
      });

      let retries = 0;
      const maxRetries = 100;

      const checkReady = () => {
        if (resolved) return;
        if (retries >= maxRetries) {
          resolved = true;
          process.kill();
          reject(new Error("FFmpeg output file not created within timeout"));
          return;
        }
        retries++;
        try {
          const info = statSync(options.outputPath);
          if (info.size > 0) {
            resolved = true;
            this.activeSessions.set(sessionId, {
              process,
              options,
              startedAt,
              sessionId,
            });
            resolve({ sessionId, startedAt });
            return;
          }
          // File exists but FFmpeg hasn't written data yet — keep polling.
        } catch {
          // File not created yet — keep polling.
        }
        setTimeout(checkReady, 100);
      };

      setTimeout(checkReady, 50);
    });
  }

  async stop(sessionId: string): Promise<CaptureResult> {
    const capture = this.activeSessions.get(sessionId);
    if (!capture) {
      throw new Error(`No active capture session: ${sessionId}`);
    }

    this.activeSessions.delete(sessionId);

    const durationMs = Date.now() - new Date(capture.startedAt).getTime();

    await new Promise<void>((resolve) => {
      const proc = capture.process;
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      proc.on("close", done);

      // Graceful quit first: "q" lets FFmpeg finalize the MP4 trailer (moov).
      // A bare SIGINT hard-kills on Windows and leaves unplayable files.
      try {
        if (proc.stdin) {
          proc.stdin.write("q");
        } else {
          proc.kill("SIGINT");
        }
      } catch {
        try {
          proc.kill("SIGINT");
        } catch {
          // ignore — SIGKILL fallback below still runs
        }
      }

      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        done();
      }, 3000);
    });

    let fileSizeBytes = 0;
    try {
      const info = statSync(capture.options.outputPath);
      fileSizeBytes = info.size;
    } catch {
      fileSizeBytes = 0;
    }

    return {
      outputPath: capture.options.outputPath,
      durationMs,
      fileSizeBytes,
      width: capture.options.width,
      height: capture.options.height,
    };
  }

  getActiveSessionIds(): string[] {
    return [...this.activeSessions.keys()];
  }

  private buildArgs(options: CaptureOptions): string[] {
    const args: string[] = [];

    args.push("-y");
    args.push("-f", "gdigrab");
    args.push("-framerate", String(options.fps));

    if (options.captureMode === "window" && options.windowTitle) {
      args.push("-i", `title=${options.windowTitle}`);
    } else if (options.displayId) {
      args.push("-i", options.displayId);
    } else {
      args.push("-i", "desktop");
    }

    if (options.audio === "none" || options.audio === undefined) {
      args.push("-an");
    } else {
      if (options.audio === "system" || options.audio === "both") {
        args.push("-f", "dshow", "-i", "audio=virtual-audio-capturer");
      }
    }

    args.push("-c:v", "libx264");
    args.push("-preset", "ultrafast");
    args.push("-pix_fmt", "yuv420p");
    args.push("-movflags", "+faststart");

    if (options.width && options.height) {
      args.push("-vf", `scale=${options.width}:${options.height}`);
    }

    args.push(options.outputPath);

    return args;
  }
}
