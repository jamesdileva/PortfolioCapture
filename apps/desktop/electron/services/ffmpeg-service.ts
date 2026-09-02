import { spawn, type ChildProcess } from "child_process";
import type {
  MediaInfo,
  TranscodeOptions,
  FFmpegService,
} from "../../../../packages/shared/types/index.js";

export type ExecFn = (
  command: string,
  args: string[],
) => ChildProcess;

const defaultExec: ExecFn = (command, args) => spawn(command, args);

function execPromise(execFn: ExecFn, command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = execFn(command, args);
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run ${command}: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export class FfmpegServiceImpl implements FFmpegService {
  private ffmpegPath: string;
  private ffprobePath: string;
  private execFn: ExecFn;

  constructor(ffmpegPath = "ffmpeg", ffprobePath = "ffprobe", execFn?: ExecFn) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
    this.execFn = execFn ?? defaultExec;
  }

  async probe(file: string): Promise<MediaInfo> {
    const { stdout } = await execPromise(this.execFn, this.ffprobePath, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      file,
    ]);

    const parsed = JSON.parse(stdout);

    const videoStream = parsed.streams?.find(
      (s: { codec_type: string }) => s.codec_type === "video"
    );

    if (!videoStream) {
      throw new Error("No video stream found");
    }

    const durationSec = parseFloat(parsed.format?.duration ?? "0");
    const fpsParts = videoStream.r_frame_rate?.split("/") ?? ["0", "1"];
    const fps = parseFloat(fpsParts[0]) / parseFloat(fpsParts[1] || "1");

    return {
      width: parseInt(videoStream.width ?? "0", 10),
      height: parseInt(videoStream.height ?? "0", 10),
      durationMs: Math.round(durationSec * 1000),
      codec: videoStream.codec_name ?? "unknown",
      fps: Math.round(fps * 100) / 100,
      bitrate: parseInt(parsed.format?.bit_rate ?? "0", 10),
    };
  }

  async generateThumbnail(input: string, output: string, timestampPercent = 20): Promise<void> {
    const info = await this.probe(input);
    const timestampSec = (info.durationMs / 1000) * (timestampPercent / 100);

    await execPromise(this.execFn, this.ffmpegPath, [
      "-y",
      "-ss", String(timestampSec),
      "-i", input,
      "-frames:v", "1",
      "-q:v", "2",
      output,
    ]);
  }

  async extractFrame(input: string, output: string, timestampSec: number): Promise<void> {
    await execPromise(this.execFn, this.ffmpegPath, [
      "-y",
      "-ss", String(timestampSec),
      "-i", input,
      "-frames:v", "1",
      output,
    ]);
  }

  async transcode(input: string, output: string, options?: TranscodeOptions): Promise<void> {
    const args: string[] = ["-y", "-i", input];

    if (options?.codec) {
      args.push("-c:v", options.codec);
    } else {
      args.push("-c:v", "libx264");
    }

    if (options?.width && options?.height) {
      args.push("-vf", `scale=${options.width}:${options.height}`);
    }

    if (options?.fps) {
      args.push("-r", String(options.fps));
    }

    if (options?.audioCodec) {
      args.push("-c:a", options.audioCodec);
    } else {
      args.push("-c:a", "copy");
    }

    if (options?.audioBitrate) {
      args.push("-b:a", options.audioBitrate);
    }

    args.push(output);

    await execPromise(this.execFn, this.ffmpegPath, args);
  }
}
