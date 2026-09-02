export type SessionStatus =
  | "starting"
  | "recording"
  | "paused"
  | "finalizing"
  | "processing"
  | "complete"
  | "failed"
  | "cancelled";

export type SessionTrigger =
  | "manual"
  | "process_launch"
  | "hotkey"
  | "scheduled";

export type AssetType =
  | "raw_video"
  | "demo_video"
  | "highlight"
  | "screenshot"
  | "thumbnail"
  | "gif"
  | "export";

export interface Project {
  id: string;
  name: string;
  path: string;
  executablePath: string | null;
  launchCommand: string | null;
  enabled: boolean;
  autoRecord: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingSession {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  trigger: SessionTrigger;
  durationMs: number | null;
  rawVideoPath: string | null;
}

export interface MediaAsset {
  id: string;
  sessionId: string;
  projectId: string;
  type: AssetType;
  path: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

export interface Settings {
  key: string;
  value: string;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  executablePath?: string;
  launchCommand?: string;
  enabled?: boolean;
  autoRecord?: boolean;
}

export interface UpdateProjectInput {
  name?: string;
  path?: string;
  executablePath?: string | null;
  launchCommand?: string | null;
  enabled?: boolean;
  autoRecord?: boolean;
}

export interface CreateSessionInput {
  projectId: string;
  trigger: SessionTrigger;
}

export interface CreateAssetInput {
  sessionId: string;
  projectId: string;
  type: AssetType;
  path: string;
  durationMs?: number;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
}

export interface DetectedProcess {
  pid: number;
  name: string;
  executablePath: string | null;
}

export interface ProcessMonitorConfig {
  pollIntervalMs: number;
}

export type AudioMode = "none" | "system" | "microphone" | "both";

export interface CaptureOptions {
  outputPath: string;
  fps: number;
  width: number;
  height: number;
  audio: AudioMode;
  displayId?: string;
}

export interface CaptureSession {
  sessionId: string;
  startedAt: string;
}

export interface CaptureResult {
  outputPath: string;
  durationMs: number;
  fileSizeBytes: number;
  width: number;
  height: number;
}

export interface CaptureProvider {
  start(options: CaptureOptions): Promise<CaptureSession>;
  stop(sessionId: string): Promise<CaptureResult>;
}

export interface MediaInfo {
  width: number;
  height: number;
  durationMs: number;
  codec: string;
  fps: number;
  bitrate: number;
}

export interface TranscodeOptions {
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  audioCodec?: string;
  audioBitrate?: string;
}

export interface FFmpegService {
  probe(file: string): Promise<MediaInfo>;
  generateThumbnail(input: string, output: string, timestampPercent?: number): Promise<void>;
  extractFrame(input: string, output: string, timestampSec: number): Promise<void>;
  transcode(input: string, output: string, options?: TranscodeOptions): Promise<void>;
}

export interface ScreenshotExtractorConfig {
  minScreenshots: number;
  maxScreenshots: number;
  skipFirstSeconds: number;
  similarityThreshold: number;
  intervalSeconds: number;
}

export interface ExtractedScreenshot {
  path: string;
  timestampMs: number;
  width: number;
  height: number;
}

export interface ScreenshotExtractor {
  extract(inputVideo: string, outputDir: string, config?: Partial<ScreenshotExtractorConfig>): Promise<ExtractedScreenshot[]>;
}
