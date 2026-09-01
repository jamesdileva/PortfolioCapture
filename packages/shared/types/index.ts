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
