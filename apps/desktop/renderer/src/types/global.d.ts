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
  ProjectFileInfo,
  ProjectMetadata,
  ProjectStructure,
  FeatureEvidence,
  FeatureEvidenceInput,
  FeatureEvidenceUpdateInput,
} from "../../../../packages/shared/types/index.js";

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
}

interface PortfolioScannerAPI {
  scan: (projectPath: string) => Promise<ProjectStructure>;
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
}

declare global {
  interface Window {
    portfolio: PortfolioAPI;
  }
}
