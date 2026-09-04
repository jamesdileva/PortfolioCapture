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
  | "trimmed_video"
  | "demo_video"
  | "highlight"
  | "screenshot"
  | "thumbnail"
  | "gif"
  | "export";

export type ProjectStatus = "active" | "paused" | "archived" | "completed";

export interface Project {
  id: string;
  name: string;
  path: string;
  executablePath: string | null;
  launchCommand: string | null;
  enabled: boolean;
  autoRecord: boolean;
  description: string | null;
  features: string[];
  techStack: string[];
  githubUrl: string | null;
  projectStatus: ProjectStatus;
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
  description?: string;
  features?: string[];
  techStack?: string[];
  githubUrl?: string;
  projectStatus?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  path?: string;
  executablePath?: string | null;
  launchCommand?: string | null;
  enabled?: boolean;
  autoRecord?: boolean;
  description?: string | null;
  features?: string[];
  techStack?: string[];
  githubUrl?: string | null;
  projectStatus?: ProjectStatus;
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

export interface IdleSegment {
  startMs: number;
  endMs: number;
  idle: boolean;
}

export interface IdleDetectorConfig {
  idleTimeoutMs: number;
  pollIntervalMs: number;
}

export interface IdleDetector {
  start(): void;
  stop(): void;
  recordActivity(): void;
  isIdle(): boolean;
  getTimeline(): IdleSegment[];
  onIdle(callback: () => void): void;
  onActive(callback: () => void): void;
}

export interface SmartTrimmerConfig {
  minIdleDurationMs: number;
  mergeGapMs: number;
  outputFilename: string;
}

export interface TrimResult {
  outputPath: string;
  durationBeforeMs: number;
  durationAfterMs: number;
  removedMs: number;
  removedPercent: number;
  segmentsRemoved: number;
}

export interface SmartTrimmer {
  trim(inputVideo: string, outputDir: string, timeline: IdleSegment[], config?: Partial<SmartTrimmerConfig>): Promise<TrimResult>;
}

export interface DemoGeneratorConfig {
  targetDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  introPath: string | null;
  outroPath: string | null;
  outputFilename: string;
}

export interface DemoResult {
  outputPath: string;
  durationMs: number;
  segmentCount: number;
  hasIntro: boolean;
  hasOutro: boolean;
}

export interface DemoGenerator {
  generate(trimmedVideo: string, outputDir: string, config?: Partial<DemoGeneratorConfig>): Promise<DemoResult>;
}

export interface ExportBundleConfig {
  outputDir: string;
}

export interface ExportBundleResult {
  exportPath: string;
  demoIncluded: boolean;
  screenshotCount: number;
  metadataIncluded: boolean;
  readmeIncluded: boolean;
}

export interface ExportService {
  exportProject(projectId: string, config?: Partial<ExportBundleConfig>): Promise<ExportBundleResult>;
}

export interface HighlightScoreSignals {
  interactionDensity: number;
  visualChange: number;
  windowChange: number;
  manualMarker: boolean;
}

export interface HighlightScoreConfig {
  interactionWeight: number;
  visualWeight: number;
  windowWeight: number;
  markerWeight: number;
  markerBoost: number;
}

export interface HighlightScoreResult {
  score: number;
  breakdown: {
    interaction: number;
    visual: number;
    window: number;
    marker: number;
  };
  timestampMs: number;
}

export interface HighlightScorer {
  score(signals: HighlightScoreSignals, timestampMs: number, config?: Partial<HighlightScoreConfig>): HighlightScoreResult;
  scoreAll(segments: Array<{ signals: HighlightScoreSignals; timestampMs: number }>, config?: Partial<HighlightScoreConfig>): HighlightScoreResult[];
}

export interface Scene {
  timestampMs: number;
  score: number;
}

export interface SceneDetectorConfig {
  threshold: number;
  minSceneGapMs: number;
}

export interface SceneDetector {
  detect(inputVideo: string, config?: Partial<SceneDetectorConfig>): Promise<Scene[]>;
}

export interface TimelineSegment {
  startMs: number;
  endMs: number;
  label: string;
  priority: number;
}

export interface Timeline {
  segments: TimelineSegment[];
  spanMs: number;
}

export interface TimelineAssemblerConfig {
  maxDurationMs: number;
  minSegmentDurationMs: number;
  introPath: string | null;
  outroPath: string | null;
}

export interface TimelineAssembler {
  assemble(
    scenes: Scene[],
    highlights: HighlightScoreResult[],
    videoDurationMs: number,
    config?: Partial<TimelineAssemblerConfig>,
  ): Timeline;
}

export interface ScreenshotRankConfig {
  maxScreenshots: number;
  minScoreThreshold: number;
  similarityThreshold: number;
  weights: ScreenshotWeights;
}

export interface ScreenshotWeights {
  visualUniqueness: number;
  interactionProximity: number;
  readability: number;
  durationOnScreen: number;
  featureCoverage: number;
}

export interface RankedScreenshot {
  framePath: string;
  timestampMs: number;
  score: number;
  factors: {
    visualUniqueness: number;
    interactionProximity: number;
    readability: number;
    durationOnScreen: number;
    featureCoverage: number;
  };
}

export interface ScreenshotRankContext {
  interactionTimestamps: number[];
  segmentDurations: number[];
  videoDurationMs: number;
}

export interface ScreenshotRanker {
  rank(
    frames: ExtractedScreenshot[],
    context: ScreenshotRankContext,
    config?: Partial<ScreenshotRankConfig>,
  ): RankedScreenshot[];
  selectRanked(
    frames: ExtractedScreenshot[],
    context: ScreenshotRankContext,
    config?: Partial<ScreenshotRankConfig>,
  ): RankedScreenshot[];
}

export type ProfilePresetName =
  | "quick_demo"
  | "portfolio_demo"
  | "long_session"
  | "screenshot_only"
  | "manual";

export interface RecordingProfileSettings {
  fps: number;
  width: number;
  height: number;
  audio: AudioMode;
  idleTimeoutMs: number;
  minIdleDurationMs: number;
  maxScreenshots: number;
  demoTargetDurationMs: number;
  demoMinDurationMs: number;
  demoMaxDurationMs: number;
  screenshotsOnly: boolean;
}

export interface RecordingProfile {
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  presetName: ProfilePresetName | null;
  settings: RecordingProfileSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  name: string;
  description?: string;
  settings: Partial<RecordingProfileSettings>;
  presetName?: ProfilePresetName;
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  settings?: Partial<RecordingProfileSettings>;
}

export interface RecordingProfileService {
  list(): RecordingProfile[];
  getById(id: string): RecordingProfile | null;
  create(input: CreateProfileInput): RecordingProfile;
  update(id: string, input: UpdateProfileInput): RecordingProfile;
  delete(id: string): void;
  getPreset(presetName: ProfilePresetName): RecordingProfile;
  getSettingsForProfile(id: string): RecordingProfileSettings;
}
