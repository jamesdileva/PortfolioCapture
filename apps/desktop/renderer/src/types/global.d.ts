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
} from "../../../../packages/shared/types/index.js";

interface PortfolioProjectsAPI {
  list: () => Promise<Project[]>;
  get: (id: string) => Promise<Project | null>;
  create: (input: CreateProjectInput) => Promise<Project>;
  update: (id: string, input: UpdateProjectInput) => Promise<Project | null>;
  delete: (id: string) => Promise<boolean>;
}

interface PortfolioSessionsAPI {
  start: (projectId: string) => Promise<RecordingSession>;
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

interface PortfolioAPI {
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  projects: PortfolioProjectsAPI;
  sessions: PortfolioSessionsAPI;
  assets: PortfolioAssetsAPI;
  settings: PortfolioSettingsAPI;
  export: PortfolioExportAPI;
}

declare global {
  interface Window {
    portfolio: PortfolioAPI;
  }
}
