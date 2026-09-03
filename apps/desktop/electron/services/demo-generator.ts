import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { spawn, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import type {
  DemoGeneratorConfig,
  DemoResult,
  FFmpegService,
} from "../../../../packages/shared/types/index.js";

export type ExecFn = (command: string, args: string[]) => ChildProcess;

const defaultExec: ExecFn = (command, args) => spawn(command, args);

const DEFAULT_CONFIG: DemoGeneratorConfig = {
  targetDurationMs: 60_000,
  minDurationMs: 30_000,
  maxDurationMs: 90_000,
  introPath: null,
  outroPath: null,
  outputFilename: "demo.mp4",
};

function execPromise(execFn: ExecFn, command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = execFn(command, args);
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
    proc.on("error", (err) => reject(new Error(`Failed to run ${command}: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

export class DemoGeneratorImpl {
  private ffmpegService: FFmpegService;
  private config: DemoGeneratorConfig;
  private execFn: ExecFn;

  constructor(ffmpegService: FFmpegService, config?: Partial<DemoGeneratorConfig>, execFn?: ExecFn) {
    this.ffmpegService = ffmpegService;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.execFn = execFn ?? defaultExec;
  }

  async generate(
    trimmedVideo: string,
    outputDir: string,
    config?: Partial<DemoGeneratorConfig>,
  ): Promise<DemoResult> {
    const mergedConfig = { ...this.config, ...config };

    if (!existsSync(trimmedVideo)) {
      throw new Error(`Trimmed video not found: ${trimmedVideo}`);
    }

    const mediaInfo = await this.ffmpegService.probe(trimmedVideo);
    const trimmedDurationMs = mediaInfo.durationMs;

    const segmentsDir = join(outputDir, `_demo_${randomBytes(4).toString("hex")}`);
    mkdirSync(segmentsDir, { recursive: true });

    const partPaths: string[] = [];
    let segmentCount = 0;
    let hasIntro = false;
    let hasOutro = false;

    try {
      if (mergedConfig.introPath && existsSync(mergedConfig.introPath)) {
        const introOut = join(segmentsDir, "intro.mp4");
        await this.copyTranscode(mergedConfig.introPath, introOut);
        partPaths.push(introOut);
        hasIntro = true;
      }

      if (trimmedDurationMs <= mergedConfig.maxDurationMs) {
        const segOut = join(segmentsDir, "content.mp4");
        await this.copyTranscode(trimmedVideo, segOut);
        partPaths.push(segOut);
        segmentCount = 1;
      } else {
        const targetContentMs = mergedConfig.targetDurationMs
          - (hasIntro ? (await this.ffmpegService.probe(mergedConfig.introPath!)).durationMs : 0)
          - (mergedConfig.outroPath && existsSync(mergedConfig.outroPath)
            ? (await this.ffmpegService.probe(mergedConfig.outroPath)).durationMs
            : 0);

        const clampedTarget = Math.max(mergedConfig.minDurationMs, Math.min(targetContentMs, mergedConfig.maxDurationMs));

        const extractedParts = await this.extractDistributedSegments(
          trimmedVideo,
          trimmedDurationMs,
          clampedTarget,
          segmentsDir,
        );
        partPaths.push(...extractedParts);
        segmentCount = extractedParts.length;
      }

      if (mergedConfig.outroPath && existsSync(mergedConfig.outroPath)) {
        const outroOut = join(segmentsDir, "outro.mp4");
        await this.copyTranscode(mergedConfig.outroPath, outroOut);
        partPaths.push(outroOut);
        hasOutro = true;
      }

      mkdirSync(outputDir, { recursive: true });
      const outputPath = join(outputDir, mergedConfig.outputFilename);
      await this.concatenateParts(partPaths, outputPath);

      const resultInfo = await this.ffmpegService.probe(outputPath);

      return {
        outputPath,
        durationMs: resultInfo.durationMs,
        segmentCount,
        hasIntro,
        hasOutro,
      };
    } finally {
      this.cleanup(segmentsDir, partPaths);
    }
  }

  private async extractDistributedSegments(
    inputVideo: string,
    totalDurationMs: number,
    targetDurationMs: number,
    segmentsDir: string,
  ): Promise<string[]> {
    const SEGMENT_COUNT = 5;
    const segmentDurationMs = targetDurationMs / SEGMENT_COUNT;
    const segmentDurationSec = segmentDurationMs / 1000;
    const strideMs = totalDurationMs / SEGMENT_COUNT;

    const paths: string[] = [];

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const startMs = i * strideMs;
      const startSec = startMs / 1000;
      const segFile = join(segmentsDir, `seg_${String(i).padStart(4, "0")}.mp4`);

      await execPromise(this.execFn, "ffmpeg", [
        "-y",
        "-ss", String(startSec),
        "-i", inputVideo,
        "-t", String(segmentDurationSec),
        "-c:v", "libx264",
        "-preset", "fast",
        "-c:a", "aac",
        segFile,
      ]);

      paths.push(segFile);
    }

    return paths;
  }

  private async copyTranscode(input: string, output: string): Promise<void> {
    await execPromise(this.execFn, "ffmpeg", [
      "-y",
      "-i", input,
      "-c:v", "libx264",
      "-preset", "fast",
      "-c:a", "aac",
      output,
    ]);
  }

  private async concatenateParts(partPaths: string[], output: string): Promise<void> {
    const listFile = output + ".demo_parts.txt";
    const content = partPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
    writeFileSync(listFile, content, "utf-8");

    try {
      await execPromise(this.execFn, "ffmpeg", [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        "-c", "copy",
        output,
      ]);
    } finally {
      try { rmSync(listFile, { force: true }); } catch { /* ignore */ }
    }
  }

  private cleanup(segmentsDir: string, partPaths: string[]): void {
    for (const p of partPaths) {
      try { rmSync(p, { force: true }); } catch { /* ignore */ }
    }
    try { rmSync(segmentsDir, { force: true, recursive: true }); } catch { /* ignore */ }
  }
}
