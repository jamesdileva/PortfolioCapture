import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type {
  RecordingSession,
  SessionTrigger,
  CaptureProvider,
  CaptureOptions,
  CaptureResult,
  AudioMode,
  ScreenshotExtractor,
  IdleSegment,
  SmartTrimmer,
  DemoGenerator,
  ScreenshotRanker,
  RecordingProfileSettings,
  CaptureMode,
  TimelineAssembler,
  FeatureChapterGenerator,
  DemoQualityScorer,
  FeatureEvidenceService,
  SceneDetector,
} from "../../../../packages/shared/types/index.js";
import type { SessionService } from "./session-service.js";
import type { ProjectService } from "./project-service.js";
import type { AssetService } from "./asset-service.js";
import type { SettingsService } from "./settings-service.js";
import type { IdleDetectorImpl } from "./idle-detector.js";

export type IdleDetectorFactory = (config?: Partial<import("../../../../packages/shared/types/index.js").IdleDetectorConfig>) => IdleDetectorImpl;

interface SessionManagerConfig {
  outputRoot: string;
  fps: number;
  width: number;
  height: number;
  audio: AudioMode;
  captureMode?: CaptureMode;
  windowTitle?: string;
}

const DEFAULT_CONFIG: SessionManagerConfig = {
  outputRoot: "data/recordings",
  fps: 30,
  width: 1920,
  height: 1080,
  audio: "none",
};

interface ActiveSession {
  session: RecordingSession;
  captureSessionId: string;
  projectId: string;
  idleDetector?: IdleDetectorImpl;
  profileSettings?: Partial<RecordingProfileSettings>;
}

export interface SessionManagerOptions {
  sessionService: SessionService;
  captureProvider: CaptureProvider;
  projectService: ProjectService;
  config?: Partial<SessionManagerConfig>;
  screenshotExtractor?: ScreenshotExtractor;
  assetService?: AssetService;
  idleDetectorFactory?: IdleDetectorFactory;
  settingsService?: SettingsService;
  smartTrimmer?: SmartTrimmer;
  demoGenerator?: DemoGenerator;
  screenshotRanker?: ScreenshotRanker;
  timelineAssembler?: TimelineAssembler;
  featureChapterGenerator?: FeatureChapterGenerator;
  demoQualityScorer?: DemoQualityScorer;
  featureEvidenceService?: FeatureEvidenceService;
  sceneDetector?: SceneDetector;
  onSessionComplete?: (projectId: string, sessionId: string) => void;
}

export class SessionManager {
  private activeByProject: Map<string, ActiveSession> = new Map();
  private config: SessionManagerConfig;
  private sessionService: SessionService;
  private captureProvider: CaptureProvider;
  private projectService: ProjectService;
  private screenshotExtractor?: ScreenshotExtractor;
  private assetService?: AssetService;
  private idleDetectorFactory?: IdleDetectorFactory;
  private settingsService?: SettingsService;
  private smartTrimmer?: SmartTrimmer;
  private demoGenerator?: DemoGenerator;
  private screenshotRanker?: ScreenshotRanker;
  private timelineAssembler?: TimelineAssembler;
  private featureChapterGenerator?: FeatureChapterGenerator;
  private demoQualityScorer?: DemoQualityScorer;
  private featureEvidenceService?: FeatureEvidenceService;
  private sceneDetector?: SceneDetector;
  private onSessionComplete?: (projectId: string, sessionId: string) => void;

  constructor(options: SessionManagerOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.sessionService = options.sessionService;
    this.captureProvider = options.captureProvider;
    this.projectService = options.projectService;
    this.screenshotExtractor = options.screenshotExtractor;
    this.assetService = options.assetService;
    this.idleDetectorFactory = options.idleDetectorFactory;
    this.settingsService = options.settingsService;
    this.smartTrimmer = options.smartTrimmer;
    this.demoGenerator = options.demoGenerator;
    this.screenshotRanker = options.screenshotRanker;
    this.timelineAssembler = options.timelineAssembler;
    this.featureChapterGenerator = options.featureChapterGenerator;
    this.demoQualityScorer = options.demoQualityScorer;
    this.featureEvidenceService = options.featureEvidenceService;
    this.sceneDetector = options.sceneDetector;
    this.onSessionComplete = options.onSessionComplete;
  }

  async startSession(projectId: string, trigger: SessionTrigger, profileSettings?: Partial<RecordingProfileSettings>): Promise<RecordingSession> {
    if (this.activeByProject.has(projectId)) {
      throw new Error(`Session already active for project ${projectId}`);
    }

    const project = this.projectService.getById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const session = this.sessionService.create({ projectId, trigger });

    const outputDir = join(this.config.outputRoot, projectId, session.id);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = join(outputDir, "raw.mp4");

    const effectiveWidth = profileSettings?.width ?? this.config.width;
    const effectiveHeight = profileSettings?.height ?? this.config.height;
    const effectiveFps = profileSettings?.fps ?? this.config.fps;
    const effectiveAudio = profileSettings?.audio ?? this.config.audio;

    const captureOptions: CaptureOptions = {
      outputPath,
      fps: effectiveFps,
      width: effectiveWidth,
      height: effectiveHeight,
      audio: effectiveAudio,
      captureMode: profileSettings?.captureMode ?? this.config.captureMode,
      windowTitle: profileSettings?.windowTitle ?? this.config.windowTitle,
    };

    try {
      const captureSession = await this.captureProvider.start(captureOptions);

      this.activeByProject.set(projectId, {
        session: { ...session, status: "recording" },
        captureSessionId: captureSession.sessionId,
        projectId,
        profileSettings,
      });

      const active = this.activeByProject.get(projectId)!;
      if (this.idleDetectorFactory && profileSettings?.idleTimeoutMs !== 0) {
        const idleTimeout = profileSettings?.idleTimeoutMs ?? 15000;
        const detector = this.idleDetectorFactory({ idleTimeoutMs: idleTimeout });
        detector.start();
        active.idleDetector = detector;
      }

      this.sessionService.updateStatus(session.id, "recording");
      return this.sessionService.getById(session.id)!;
    } catch (err) {
      this.sessionService.updateStatus(session.id, "failed");
      this.activeByProject.delete(projectId);
      throw err;
    }
  }

  async stopSession(projectId: string): Promise<RecordingSession | null> {
    const active = this.activeByProject.get(projectId);
    if (!active) {
      return null;
    }

    this.sessionService.updateStatus(active.session.id, "finalizing");

    let timeline: IdleSegment[] = [];
    if (active.idleDetector) {
      active.idleDetector.stop();
      timeline = active.idleDetector.getTimeline();
    }

    try {
      const result = await this.captureProvider.stop(active.captureSessionId);

      this.activeByProject.delete(projectId);

      this.sessionService.updateRawVideoPath(active.session.id, result.outputPath);

      if (timeline.length > 0) {
        this.settingsService?.set(`timeline:${active.session.id}`, JSON.stringify(timeline));
      }

      const screenshotsOnly = active.profileSettings?.screenshotsOnly ?? false;

      if (!screenshotsOnly) {
        await this.extractScreenshots(active.session.id, active.projectId, result.outputPath, active.profileSettings);

        const trimmedVideoPath = await this.trimVideo(active.session.id, active.projectId, result.outputPath, timeline);

        await this.generateDemo(active.session.id, active.projectId, trimmedVideoPath, active.profileSettings);

        const scenes = await this.assembleTimeline(active.session.id, active.projectId, result.outputPath, timeline);

        await this.generateChapters(active.session.id, active.projectId, result.outputPath, scenes);

        this.scoreDemoQuality(active.session.id, active.projectId, timeline);
      } else {
        await this.extractScreenshots(active.session.id, active.projectId, result.outputPath, active.profileSettings);
      }

      this.sessionService.updateStatus(active.session.id, "complete");

      this.onSessionComplete?.(active.projectId, active.session.id);

      return this.sessionService.getById(active.session.id)!;
    } catch {
      this.activeByProject.delete(projectId);
      if (timeline.length > 0) {
        this.settingsService?.set(`timeline:${active.session.id}`, JSON.stringify(timeline));
      }
      this.sessionService.updateStatus(active.session.id, "complete");
      return this.sessionService.getById(active.session.id)!;
    }
  }

  async onProcessStarted(project: { id: string; name: string }): Promise<void> {
    try {
      await this.startSession(project.id, "process_launch");
    } catch {
      // swallow — project not enabled or already recording
    }
  }

  async onProcessStopped(project: { id: string; name: string }): Promise<void> {
    await this.stopSession(project.id);
  }

  async onDevServerStarted(project: { id: string; name: string }): Promise<void> {
    try {
      await this.startSession(project.id, "dev_server_launch");
    } catch {
      // swallow — project not enabled or already recording
    }
  }

  async onDevServerStopped(project: { id: string; name: string }): Promise<void> {
    await this.stopSession(project.id);
  }

  getActiveSessionForProject(projectId: string): ActiveSession | undefined {
    return this.activeByProject.get(projectId);
  }

  getActiveProjectIds(): string[] {
    return [...this.activeByProject.keys()];
  }

  recordActivity(projectId: string): void {
    const active = this.activeByProject.get(projectId);
    if (active?.idleDetector) {
      active.idleDetector.recordActivity();
    }
  }

  getTimelineForProject(projectId: string): IdleSegment[] {
    const active = this.activeByProject.get(projectId);
    if (active?.idleDetector) {
      return active.idleDetector.getTimeline();
    }
    return [];
  }

  private async extractScreenshots(
    sessionId: string,
    projectId: string,
    rawVideoPath: string,
    profileSettings?: Partial<RecordingProfileSettings>,
  ): Promise<void> {
    if (!this.screenshotExtractor || !this.assetService) {
      return;
    }

    try {
      const screenshotsDir = join(
        this.config.outputRoot,
        projectId,
        sessionId,
        "screenshots",
      );

      const screenshots = await this.screenshotExtractor.extract(
        rawVideoPath,
        screenshotsDir,
      );

      let selectedScreenshots = screenshots;

      if (this.screenshotRanker && screenshots.length > 1) {
        const session = this.sessionService.getById(sessionId);
        const videoDurationMs = session?.durationMs ?? 60000;
        const maxScreenshots = profileSettings?.maxScreenshots ?? 5;

        const ranked = this.screenshotRanker.selectRanked(
          screenshots,
          {
            interactionTimestamps: [],
            segmentDurations: [],
            videoDurationMs,
          },
          { maxScreenshots },
        );

        if (ranked.length > 0) {
          selectedScreenshots = ranked.map((r) => ({
            path: r.framePath,
            timestampMs: r.timestampMs,
            width: 1920,
            height: 1080,
          }));
        }
      }

      for (const shot of selectedScreenshots) {
        this.assetService.create({
          sessionId,
          projectId,
          type: "screenshot",
          path: shot.path,
          width: shot.width,
          height: shot.height,
        });
      }
    } catch {
      // Screenshot extraction is best-effort; don't fail the session
    }
  }

  private async trimVideo(
    sessionId: string,
    projectId: string,
    rawVideoPath: string,
    timeline: IdleSegment[],
  ): Promise<string | null> {
    if (!this.smartTrimmer || !this.assetService || timeline.length === 0) {
      return null;
    }

    try {
      const sessionDir = join(this.config.outputRoot, projectId, sessionId);
      const result = await this.smartTrimmer.trim(rawVideoPath, sessionDir, timeline);

      this.assetService.create({
        sessionId,
        projectId,
        type: "trimmed_video",
        path: result.outputPath,
        durationMs: result.durationAfterMs,
      });

      return result.outputPath;
    } catch {
      // Smart trimming is best-effort; don't fail the session
      return null;
    }
  }

  private async generateDemo(
    sessionId: string,
    projectId: string,
    trimmedVideoPath: string | null,
    profileSettings?: Partial<RecordingProfileSettings>,
  ): Promise<void> {
    if (!this.demoGenerator || !this.assetService || !trimmedVideoPath) {
      return;
    }

    try {
      const processedDir = join(this.config.outputRoot, projectId, sessionId, "processed");

      const result = await this.demoGenerator.generate(trimmedVideoPath, processedDir);

      this.assetService.create({
        sessionId,
        projectId,
        type: "demo_video",
        path: result.outputPath,
        durationMs: result.durationMs,
      });
    } catch {
      // Demo generation is best-effort; don't fail the session
    }
  }

  private async assembleTimeline(
    sessionId: string,
    projectId: string,
    rawVideoPath: string,
    timeline: IdleSegment[],
  ): Promise<import("../../../../packages/shared/types/index.js").Scene[]> {
    if (!this.timelineAssembler || !this.sceneDetector || !this.settingsService) {
      return [];
    }

    try {
      const scenes = await this.sceneDetector.detect(rawVideoPath);
      const videoDurationMs = timeline.length > 0
        ? timeline[timeline.length - 1].endMs - timeline[0].startMs
        : 60_000;

      const result = this.timelineAssembler.assemble(scenes, [], videoDurationMs);
      this.settingsService.set(`assembled-timeline:${sessionId}`, JSON.stringify(result));
      return scenes;
    } catch {
      // Timeline assembly is best-effort; don't fail the session
      return [];
    }
  }

  private async generateChapters(
    sessionId: string,
    projectId: string,
    rawVideoPath: string,
    preDetectedScenes?: import("../../../../packages/shared/types/index.js").Scene[],
  ): Promise<void> {
    if (!this.featureChapterGenerator || !this.featureEvidenceService) {
      return;
    }

    try {
      const evidence = this.featureEvidenceService.list(projectId);
      const chapters = await this.featureChapterGenerator.generateChapters(
        rawVideoPath,
        sessionId,
        evidence,
        preDetectedScenes && preDetectedScenes.length > 0 ? { scenes: preDetectedScenes } : undefined,
      );
      this.featureChapterGenerator.saveChapters(sessionId, chapters);
      if (this.settingsService) {
        this.settingsService.set(`demo-chapters:${sessionId}`, JSON.stringify(chapters));
      }
    } catch {
      // Chapter generation is best-effort; don't fail the session
    }
  }

  private scoreDemoQuality(
    sessionId: string,
    projectId: string,
    timeline: IdleSegment[],
  ): void {
    if (!this.demoQualityScorer || !this.settingsService) {
      return;
    }

    try {
      const idleTimeMs = timeline
        .filter((s) => s.idle)
        .reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
      const totalDurationMs = timeline.length > 0
        ? timeline.reduce((sum, s) => sum + (s.endMs - s.startMs), 0)
        : 60_000;

      let screenshotCount = 0;
      if (this.assetService) {
        const assets = this.assetService.listBySession(sessionId);
        screenshotCount = assets.filter((a) => a.type === "screenshot").length;
      }

      let featureCount = 0;
      if (this.featureEvidenceService) {
        const evidence = this.featureEvidenceService.list(projectId);
        featureCount = evidence.length;
      }

      const result = this.demoQualityScorer.score({
        videoDurationMs: totalDurationMs,
        idleTimeMs,
        screenshotCount,
        featureCount,
        fps: this.config.fps,
      });
      this.settingsService.set(`demo-quality:${sessionId}`, JSON.stringify(result));
    } catch {
      // Quality scoring is best-effort; don't fail the session
    }
  }
}
