import { spawn, type ChildProcess } from "child_process";
import type {
  Scene,
  SceneDetectorConfig,
  SceneDetector,
} from "../../../../packages/shared/types/index.js";

export type ExecFn = (command: string, args: string[]) => ChildProcess;

const defaultExec: ExecFn = (command, args) => spawn(command, args);

const DEFAULT_CONFIG: SceneDetectorConfig = {
  threshold: 0.3,
  minSceneGapMs: 1000,
};

function execPromise(
  execFn: ExecFn,
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
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

function parsePtsTime(line: string): number | null {
  const match = line.match(/pts_time:([\d.]+)/);
  if (!match) return null;
  const sec = parseFloat(match[1]);
  if (isNaN(sec)) return null;
  return Math.round(sec * 1000);
}

function mergeCloseScenes(scenes: Scene[], minGapMs: number): Scene[] {
  if (scenes.length === 0) return scenes;

  const merged: Scene[] = [scenes[0]];

  for (let i = 1; i < scenes.length; i++) {
    const last = merged[merged.length - 1];
    if (scenes[i].timestampMs - last.timestampMs >= minGapMs) {
      merged.push(scenes[i]);
    } else if (scenes[i].score > last.score) {
      merged[merged.length - 1] = scenes[i];
    }
  }

  return merged;
}

export class SceneDetectorImpl implements SceneDetector {
  private ffmpegPath: string;
  private execFn: ExecFn;

  constructor(ffmpegPath = "ffmpeg", execFn?: ExecFn) {
    this.ffmpegPath = ffmpegPath;
    this.execFn = execFn ?? defaultExec;
  }

  async detect(
    inputVideo: string,
    config?: Partial<SceneDetectorConfig>
  ): Promise<Scene[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    const filter = `select='gt(scene,${cfg.threshold})',showinfo`;

    const { stderr } = await execPromise(this.execFn, this.ffmpegPath, [
      "-i",
      inputVideo,
      "-vf",
      filter,
      "-f",
      "null",
      "-",
    ]);

    const scenes: Scene[] = [];

    for (const line of stderr.split("\n")) {
      if (!line.includes("Parsed_showinfo")
        && !line.includes("showinfo")
        && !line.includes("pts_time:")) {
        continue;
      }

      const tsMs = parsePtsTime(line);
      if (tsMs === null) continue;

      scenes.push({ timestampMs: tsMs, score: 1.0 });
    }

    return mergeCloseScenes(scenes, cfg.minSceneGapMs);
  }
}
