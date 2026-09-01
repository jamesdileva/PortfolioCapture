import { exec } from "child_process";
import type { DetectedProcess, ProcessMonitorConfig } from "../../../../packages/shared/types/index.js";

type ProcessCallback = (process: DetectedProcess) => void;

export type ExecFn = (command: string, options?: { timeout?: number }) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFn = (command, options) =>
  new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

const DEFAULT_CONFIG: ProcessMonitorConfig = {
  pollIntervalMs: 1000,
};

export class ProcessMonitor {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private previousProcesses: Map<number, DetectedProcess> = new Map();
  private onStartedCallbacks: ProcessCallback[] = [];
  private onStoppedCallbacks: ProcessCallback[] = [];
  private config: ProcessMonitorConfig;
  private projects: { id: string; executablePath: string | null; name: string }[] = [];
  private isRunning = false;
  private execFn: ExecFn;

  constructor(config: Partial<ProcessMonitorConfig> = {}, execFn?: ExecFn) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.execFn = execFn ?? defaultExec;
  }

  setProjects(projects: { id: string; executablePath: string | null; name: string }[]): void {
    this.projects = projects;
  }

  onProcessStarted(callback: ProcessCallback): void {
    this.onStartedCallbacks.push(callback);
  }

  onProcessStopped(callback: ProcessCallback): void {
    this.onStoppedCallbacks.push(callback);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const initialProcesses = await this.fetchProcesses();
    this.previousProcesses = new Map(initialProcesses.map((p) => [p.pid, p]));

    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {});
    }, this.config.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    this.previousProcesses.clear();
  }

  async poll(): Promise<DetectedProcess[]> {
    const currentProcesses = await this.fetchProcesses();
    const currentMap = new Map(currentProcesses.map((p) => [p.pid, p]));

    const started: DetectedProcess[] = [];
    const stopped: DetectedProcess[] = [];

    for (const [pid, proc] of currentMap) {
      if (!this.previousProcesses.has(pid)) {
        started.push(proc);
      }
    }

    for (const [pid, proc] of this.previousProcesses) {
      if (!currentMap.has(pid)) {
        stopped.push(proc);
      }
    }

    this.previousProcesses = currentMap;

    for (const proc of started) {
      for (const cb of this.onStartedCallbacks) {
        cb(proc);
      }
    }

    for (const proc of stopped) {
      for (const cb of this.onStoppedCallbacks) {
        cb(proc);
      }
    }

    return [...currentProcesses.values()];
  }

  matchProject(process: DetectedProcess): { id: string; name: string } | null {
    if (process.executablePath) {
      for (const project of this.projects) {
        if (!project.executablePath) continue;
        if (process.executablePath.toLowerCase() === project.executablePath.toLowerCase()) {
          return { id: project.id, name: project.name };
        }
      }
    }

    const detectedName = this.extractFileName(process.executablePath ?? process.name);
    for (const project of this.projects) {
      if (!project.executablePath) continue;
      const configuredName = this.extractFileName(project.executablePath);
      if (configuredName.toLowerCase() === detectedName.toLowerCase()) {
        return { id: project.id, name: project.name };
      }
    }

    return null;
  }

  private async fetchProcesses(): Promise<DetectedProcess[]> {
    try {
      if (process.platform === "win32") {
        return await this.fetchWindowsProcesses();
      }
      return await this.fetchUnixProcesses();
    } catch {
      return [];
    }
  }

  private async fetchWindowsProcesses(): Promise<DetectedProcess[]> {
    const { stdout } = await this.execFn(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, Name, ExecutablePath | ConvertTo-Json"',
      { timeout: 5000 }
    );

    const parsed = JSON.parse(stdout || "[]");
    const processes = Array.isArray(parsed) ? parsed : [parsed];

    return processes
      .filter((p: { ProcessId?: number; Name?: string }) => p.ProcessId && p.Name && p.ProcessId > 0)
      .map((p: { ProcessId: number; Name: string; ExecutablePath?: string | null }) => ({
        pid: p.ProcessId,
        name: p.Name,
        executablePath: p.ExecutablePath ?? null,
      }));
  }

  private async fetchUnixProcesses(): Promise<DetectedProcess[]> {
    const { stdout } = await this.execFn("ps -eo pid,comm", { timeout: 5000 });

    const lines = stdout.trim().split("\n").slice(1);
    const results: DetectedProcess[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const spaceIdx = trimmed.indexOf(" ");
      if (spaceIdx === -1) continue;
      const pid = parseInt(trimmed.substring(0, spaceIdx), 10);
      const name = trimmed.substring(spaceIdx + 1);
      if (isNaN(pid) || pid <= 0) continue;
      results.push({ pid, name, executablePath: null });
    }

    return results;
  }

  private extractFileName(pathOrName: string): string {
    const normalized = pathOrName.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1];
  }
}
