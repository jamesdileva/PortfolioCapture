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

      const checkReady = () => {
        if (resolved) return;
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
          }
        } catch {
          setTimeout(checkReady, 100);
        }
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

      proc.on("close", () => resolve());

      proc.kill("SIGINT");

      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        resolve();
      }, 3000);
    });

    let fileSizeBytes = 0;
    try {
      const info = statSync(capture.options.outputPath);
      fileSizeBytes = info.size;
    } catch {}

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

    if (options.displayId) {
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

    if (options.width && options.height) {
      args.push("-vf", `scale=${options.width}:${options.height}`);
    }

    args.push(options.outputPath);

    return args;
  }
}
