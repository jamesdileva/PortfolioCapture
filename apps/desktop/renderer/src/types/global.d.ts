/// <reference types="vite/client" />

import type {
  Project,
  RecordingSession,
  MediaAsset,
  Settings,
  CreateProjectInput,
  UpdateProjectInput,
  CreateSessionInput,
  CreateAssetInput,
  AssetType,
  SessionStatus,
  ExportBundleResult,
  RecordingProfile,
  CreateProfileInput,
  UpdateProfileInput,
  ProfilePresetName,
  RecordingProfileSettings,
  TimelineOverrides,
  GitRepoInfo,
  GitCommit,
  ProjectFileInfo,
  ProjectMetadata,
  ProjectStructure,
  FeatureEvidence,
  FeatureEvidenceInput,
  FeatureEvidenceUpdateInput,
  FeatureChapter,
  FeatureChapterList,
  FeatureChapterGeneratorConfig,
  ProjectAiDescription,
  ScreenshotCaption,
  PortfolioSummary,
  PortfolioGenerateConfig,
  PortfolioGenerateResult,
  PortfolioData,
  PortfolioThemeConfig,
  PortfolioThemeName,
  ThemeColorConfig,
  ZipExportResult,
  DeployResult,
  DeployTarget,
  DevServerInfo,
  WindowInfo,
  DemoQualityResult,
  DemoQualityScorerConfig,
  ProjectAutoFillResult,
} from "../../../../packages/shared/types/index.js";
import type { OrphanedSession } from "../../electron/services/crash-recovery.js";

interface PortfolioProjectsAPI {
  list: () => Promise<Project[]>;
  get: (id: string) => Promise<Project | null>;
  create: (input: CreateProjectInput) => Promise<Project>;
  update: (id: string, input: UpdateProjectInput) => Promise<Project | null>;
  delete: (id: string) => Promise<boolean>;
}

interface PortfolioSessionsAPI {
  start: (projectId: string, profileId?: string) => Promise<RecordingSession>;
  stop: (projectId: string) => Promise<RecordingSession | null>;
  list: (projectId?: string) => Promise<RecordingSession[]>;
  get: (id: string) => Promise<RecordingSession | null>;
  create: (input: CreateSessionInput) => Promise<RecordingSession>;
  updateStatus: (id: string, status: SessionStatus) => Promise<RecordingSession | null>;
  updateRawVideoPath: (id: string, rawVideoPath: string) => Promise<RecordingSession | null>;
  delete: (id: string) => Promise<boolean>;
  recordActivity: (projectId: string) => Promise<void>;
}

interface PortfolioAssetsAPI {
  listByProject: (projectId: string) => Promise<MediaAsset[]>;
  listBySession: (sessionId: string) => Promise<MediaAsset[]>;
  listByType: (projectId: string, type: AssetType) => Promise<MediaAsset[]>;
  get: (id: string) => Promise<MediaAsset | null>;
  create: (input: CreateAssetInput) => Promise<MediaAsset>;
  delete: (id: string) => Promise<boolean>;
}

interface PortfolioSettingsAPI {
  get: () => Promise<Settings[]>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<boolean>;
}

interface PortfolioExportAPI {
  project: (projectId: string) => Promise<ExportBundleResult>;
}

interface PortfolioOverridesAPI {
  get: (sessionId: string) => Promise<TimelineOverrides>;
  save: (sessionId: string, overrides: TimelineOverrides) => Promise<void>;
  clear: (sessionId: string) => Promise<void>;
}

interface PortfolioProfilesAPI {
  list: () => Promise<RecordingProfile[]>;
  get: (id: string) => Promise<RecordingProfile | null>;
  create: (input: CreateProfileInput) => Promise<RecordingProfile>;
  update: (id: string, input: UpdateProfileInput) => Promise<RecordingProfile>;
  delete: (id: string) => Promise<void>;
  getPreset: (presetName: ProfilePresetName) => Promise<RecordingProfile>;
  getSettings: (id: string) => Promise<RecordingProfileSettings>;
}

interface PortfolioGitAPI {
  repoInfo: (projectPath: string) => Promise<GitRepoInfo | null>;
  projectFile: (projectPath: string) => Promise<ProjectFileInfo>;
  metadata: (projectPath: string) => Promise<ProjectMetadata>;
  log: (projectPath: string, maxCount?: number) => Promise<GitCommit[]>;
}

interface PortfolioScannerAPI {
  scan: (projectPath: string) => Promise<ProjectStructure>;
  autofill: (projectPath: string) => Promise<ProjectAutoFillResult>;
}

interface PortfolioFeatureEvidenceAPI {
  generate: (projectId: string) => Promise<FeatureEvidence[]>;
  list: (projectId: string) => Promise<FeatureEvidence[]>;
  get: (id: string) => Promise<FeatureEvidence | null>;
  save: (input: FeatureEvidenceInput) => Promise<FeatureEvidence>;
  update: (id: string, input: FeatureEvidenceUpdateInput) => Promise<FeatureEvidence>;
  accept: (id: string) => Promise<FeatureEvidence>;
  reject: (id: string) => Promise<FeatureEvidence>;
  delete: (id: string) => Promise<void>;
}

interface PortfolioAiAPI {
  status: () => Promise<{ enabled: boolean; modelLoaded: boolean; cacheSize: number }>;
  setConfig: (config: { enabled?: boolean; modelPath?: string | null; maxTokens?: number; temperature?: number }) => Promise<void>;
  generateDescription: (input: { projectName: string; description: string | null; features: string[]; techStack: string[]; gitBranch: string | null; gitCommitMessage: string | null; readmeContent: string | null; screenshotPaths: string[]; featureNames: string[] }) => Promise<ProjectAiDescription>;
  generateScreenshotCaption: (input: { screenshotPath: string; projectName: string; featureContext: string | null; timestampMs: number }) => Promise<ScreenshotCaption>;
  generatePortfolioSummary: (input: { projectName: string; description: string | null; featureCount: number; sessionCount: number; techStack: string[] }) => Promise<PortfolioSummary>;
  clearCache: () => Promise<void>;
}

interface PortfolioGeneratorAPI {
  generate: (config?: PortfolioGenerateConfig) => Promise<PortfolioGenerateResult>;
  data: () => Promise<PortfolioData>;
  outputDir: () => Promise<string>;
}

interface PortfolioThemesAPI {
  list: () => Promise<PortfolioThemeConfig[]>;
  getActive: () => Promise<PortfolioThemeName>;
  setActive: (name: PortfolioThemeName) => Promise<boolean>;
  getCustomColors: () => Promise<Partial<ThemeColorConfig>>;
  setCustomColors: (colors: Partial<ThemeColorConfig>) => Promise<boolean>;
}

interface PortfolioDeployAPI {
  zip: (portfolioDir: string, outputPath?: string) => Promise<ZipExportResult>;
  preview: (portfolioDir: string) => Promise<{ success: boolean }>;
  run: (config: { target: DeployTarget; portfolioDir: string; outputDir?: string; siteName?: string }) => Promise<DeployResult>;
  targets: () => Promise<DeployTarget[]>;
}

interface PortfolioDevServerAPI {
  status: () => Promise<DevServerInfo[]>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

interface PortfolioWindowsAPI {
  list: () => Promise<WindowInfo[]>;
}

interface PortfolioChaptersAPI {
  generate: (videoPath: string, sessionId: string, featureEvidence: FeatureEvidence[], config?: Partial<FeatureChapterGeneratorConfig>) => Promise<FeatureChapterList>;
  get: (sessionId: string) => Promise<FeatureChapterList | null>;
  save: (sessionId: string, chapterList: FeatureChapterList) => Promise<void>;
  rename: (sessionId: string, chapterIndex: number, newTitle: string) => Promise<FeatureChapter>;
  reorder: (sessionId: string, newOrder: number[]) => Promise<FeatureChapterList>;
  delete: (sessionId: string) => Promise<void>;
}

interface PortfolioQualityAPI {
  score: (input: { videoDurationMs: number; idleTimeMs: number; screenshotCount: number; featureCount: number; fps: number }, config?: Partial<DemoQualityScorerConfig>) => Promise<DemoQualityResult>;
}

interface PortfolioCrashRecoveryAPI {
  detect: () => Promise<OrphanedSession[]>;
  discard: (sessionId: string) => Promise<void>;
  autoCleanup: () => Promise<number>;
}

interface PortfolioAPI {
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  projects: PortfolioProjectsAPI;
  sessions: PortfolioSessionsAPI;
  assets: PortfolioAssetsAPI;
  settings: PortfolioSettingsAPI;
  profiles: PortfolioProfilesAPI;
  export: PortfolioExportAPI;
  overrides: PortfolioOverridesAPI;
  git: PortfolioGitAPI;
  scanner: PortfolioScannerAPI;
  featureEvidence: PortfolioFeatureEvidenceAPI;
  ai: PortfolioAiAPI;
  portfolio: PortfolioGeneratorAPI;
  themes: PortfolioThemesAPI;
  deploy: PortfolioDeployAPI;
  devserver: PortfolioDevServerAPI;
  windows: PortfolioWindowsAPI;
  chapters: PortfolioChaptersAPI;
  quality: PortfolioQualityAPI;
  crashRecovery: PortfolioCrashRecoveryAPI;
}

declare global {
  interface Window {
    portfolio: PortfolioAPI;
  }
}
