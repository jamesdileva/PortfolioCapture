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
}
