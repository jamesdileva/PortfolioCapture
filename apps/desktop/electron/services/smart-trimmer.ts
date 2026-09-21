import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import type {
  IdleSegment,
  SmartTrimmerConfig,
  TrimResult,
  FFmpegService,
  ForegroundSegment,
  FocusEdgeTarget,
  FocusEdgeOptions,
} from "../../../../packages/shared/types/index.js";

export type ExecFn = (command: string, args: string[]) => ChildProcess;

const defaultExec: ExecFn = (command, args) => spawn(command, args);

const DEFAULT_TRIMMER_CONFIG: SmartTrimmerConfig = {
  minIdleDurationMs: 5_000,
  mergeGapMs: 500,
  outputFilename: "trimmed.mp4",
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

export class SmartTrimmerImpl {
  private ffmpegService: FFmpegService;
  private config: SmartTrimmerConfig;
  private execFn: ExecFn;

  constructor(ffmpegService: FFmpegService, config?: Partial<SmartTrimmerConfig>, execFn?: ExecFn) {
    this.ffmpegService = ffmpegService;
    this.config = { ...DEFAULT_TRIMMER_CONFIG, ...config };
    this.execFn = execFn ?? defaultExec;
  }

  async trim(
    inputVideo: string,
    outputDir: string,
    timeline: IdleSegment[],
    config?: Partial<SmartTrimmerConfig>,
  ): Promise<TrimResult> {
    const mergedConfig = { ...this.config, ...config };

    const mediaInfo = await this.ffmpegService.probe(inputVideo);
    const durationBeforeMs = mediaInfo.durationMs;

    const activeSegments = this.computeActiveSegments(timeline, durationBeforeMs, mergedConfig);

    if (activeSegments.length === 0) {
      throw new Error("No active segments to trim — entire recording is idle");
    }

    if (activeSegments.length === 1 && activeSegments[0].startMs === 0 && activeSegments[0].endMs >= durationBeforeMs - 1000) {
      throw new Error("No idle segments detected — nothing to trim");
    }

    const segmentsDir = join(outputDir, `_trim_${randomBytes(4).toString("hex")}`);
    mkdirSync(segmentsDir, { recursive: true });

    const segmentPaths: string[] = [];
    try {
      for (let i = 0; i < activeSegments.length; i++) {
        const seg = activeSegments[i];
        const segFile = join(segmentsDir, `seg_${String(i).padStart(4, "0")}.ts`);
        await this.extractSegment(inputVideo, segFile, seg.startMs / 1000, seg.endMs / 1000);
        segmentPaths.push(segFile);
      }

      const outputPath = join(outputDir, mergedConfig.outputFilename);
      await this.concatenateSegments(segmentPaths, outputPath);

      const resultInfo = await this.ffmpegService.probe(outputPath);
      const durationAfterMs = resultInfo.durationMs;
      const removedMs = durationBeforeMs - durationAfterMs;
      const removedPercent = durationBeforeMs > 0 ? Math.round((removedMs / durationBeforeMs) * 100) : 0;
      const segmentsRemoved = timeline.filter(
        (s) => s.idle && (s.endMs - s.startMs) >= mergedConfig.minIdleDurationMs,
      ).length;

      return {
        outputPath,
        durationBeforeMs,
        durationAfterMs,
        removedMs,
        removedPercent,
        segmentsRemoved,
      };
    } finally {
      this.cleanupSegments(segmentsDir, segmentPaths);
    }
  }

  computeActiveSegments(
    timeline: IdleSegment[],
    totalDurationMs: number,
    config?: Partial<SmartTrimmerConfig>,
  ): Array<{ startMs: number; endMs: number }> {
    const mergedConfig = { ...this.config, ...config };

    const significantIdle = timeline
      .filter((s) => s.idle && (s.endMs - s.startMs) >= mergedConfig.minIdleDurationMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (significantIdle.length === 0) {
      return [{ startMs: 0, endMs: totalDurationMs }];
    }

    const mergedIdle = this.mergeSegments(significantIdle, mergedConfig.mergeGapMs);

    const active: Array<{ startMs: number; endMs: number }> = [];
    let cursor = 0;

    for (const idle of mergedIdle) {
      if (cursor < idle.startMs) {
        active.push({ startMs: cursor, endMs: idle.startMs });
      }
      cursor = idle.endMs;
    }

    if (cursor < totalDurationMs) {
      active.push({ startMs: cursor, endMs: totalDurationMs });
    }

    return active;
  }

  /**
   * Cuts the lead-in/tail where the target app was not in the foreground
   * (e.g. switching away from the recorder to start, back to stop). Only
   * edges are touched — gaps in the middle are left alone. Returns null
   * when there is nothing worth cutting so callers can keep the original.
   */
  async trimEdgesFocus(
    inputVideo: string,
    outputPath: string,
    focusSegments: ForegroundSegment[],
    target: FocusEdgeTarget,
    options?: FocusEdgeOptions,
  ): Promise<string | null> {
    const paddingMs = options?.edgePaddingMs ?? 1000;
    const minResultMs = options?.minResultMs ?? 2000;

    const matches = focusSegments.filter((seg) => this.isTargetForeground(seg, target));
    if (matches.length === 0) return null;

    const mediaInfo = await this.ffmpegService.probe(inputVideo);
    const durationMs = mediaInfo.durationMs;
    if (!durationMs || durationMs <= 0) return null;

    const sorted = [...matches].sort((a, b) => a.startMs - b.startMs);
    const startMs = Math.max(0, sorted[0].startMs - paddingMs);
    const endMs = Math.min(durationMs, sorted[sorted.length - 1].endMs + paddingMs);

    if (endMs - startMs < minResultMs) return null;
    if (startMs <= paddingMs / 2 && endMs >= durationMs - 500) return null;

    await execPromise(this.execFn, "ffmpeg", [
      "-y",
      "-ss",
      String(startMs / 1000),
      "-i",
      inputVideo,
      "-to",
      String((endMs - startMs) / 1000),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ]);
    return outputPath;
  }

  isTargetForeground(seg: ForegroundSegment, target: FocusEdgeTarget): boolean {
    if (target.exePath && seg.exePath && seg.exePath.toLowerCase() === target.exePath.toLowerCase()) {
      return true;
    }
    if (target.windowTitle && seg.title.toLowerCase().includes(target.windowTitle.toLowerCase())) {
      return true;
    }
    return false;
  }

  private mergeSegments(segments: IdleSegment[], mergeGapMs: number): IdleSegment[] {
    if (segments.length === 0) return [];

    const merged: IdleSegment[] = [{ ...segments[0] }];
    for (let i = 1; i < segments.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = segments[i];
      if (curr.startMs - prev.endMs <= mergeGapMs) {
        prev.endMs = Math.max(prev.endMs, curr.endMs);
      } else {
        merged.push({ ...curr });
      }
    }
    return merged;
  }

  private async extractSegment(input: string, output: string, startSec: number, endSec: number): Promise<void> {
    await execPromise(this.execFn, "ffmpeg", [
      "-y",
      "-ss", String(startSec),
      "-i", input,
      "-to", String(endSec - startSec),
      "-c", "copy",
      "-f", "mpegts",
      output,
    ]);
  }

  private async concatenateSegments(segmentPaths: string[], output: string): Promise<void> {
    const listFile = output + ".segments.txt";
    const content = segmentPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
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

  private cleanupSegments(segmentsDir: string, segmentPaths: string[]): void {
    for (const p of segmentPaths) {
      try { rmSync(p, { force: true }); } catch { /* ignore */ }
    }
    try { rmSync(segmentsDir, { force: true, recursive: true }); } catch { /* ignore */ }
  }
}
