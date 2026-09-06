import type { DevServerConfig, DevServerInfo } from "../../../../packages/shared/types/index.js";

type DevServerCallback = (info: DevServerInfo, project: { id: string; name: string } | null) => void;

export type HttpFetchFn = (url: string, options?: { timeoutMs?: number }) => Promise<{ ok: boolean; status: number }>;

const DEFAULT_CONFIG: DevServerConfig = {
  ports: [3000, 5173, 8000, 4200, 9229],
  pollIntervalMs: 2000,
  requestTimeoutMs: 1000,
};

const defaultHttpFetch: HttpFetchFn = async (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 1000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
};

export class DevServerDetectorImpl {
  private config: DevServerConfig;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private previousServers: Map<number, DevServerInfo> = new Map();
  private onStartedCallbacks: DevServerCallback[] = [];
  private onStoppedCallbacks: DevServerCallback[] = [];
  private projects: { id: string; devServerPorts: number[]; name: string }[] = [];
  private isRunning = false;
  private httpFetch: HttpFetchFn;

  constructor(config: Partial<DevServerConfig> = {}, httpFetch?: HttpFetchFn) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.httpFetch = httpFetch ?? defaultHttpFetch;
  }

  setProjects(projects: { id: string; devServerPorts: number[]; name: string }[]): void {
    this.projects = projects;
  }

  onDevServerStarted(callback: DevServerCallback): void {
    this.onStartedCallbacks.push(callback);
  }

  onDevServerStopped(callback: DevServerCallback): void {
    this.onStoppedCallbacks.push(callback);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const initialServers = await this.scanPorts();
    this.previousServers = new Map(initialServers.map((s) => [s.port, s]));

    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {});
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    this.previousServers.clear();
  }

  async poll(): Promise<DevServerInfo[]> {
    const currentServers = await this.scanPorts();
    const currentMap = new Map(currentServers.map((s) => [s.port, s]));

    const started: DevServerInfo[] = [];
    const stopped: DevServerInfo[] = [];

    for (const [port, server] of currentMap) {
      const prev = this.previousServers.get(port);
      if (!prev || !prev.isRunning) {
        started.push(server);
      }
    }

    for (const [port, prev] of this.previousServers) {
      const current = currentMap.get(port);
      if (prev.isRunning && (!current || !current.isRunning)) {
        stopped.push({ port, url: `http://localhost:${port}`, isRunning: false });
      }
    }

    this.previousServers = currentMap;

    for (const server of started) {
      const matchedProject = this.matchProject(server.port);
      for (const cb of this.onStartedCallbacks) {
        cb(server, matchedProject);
      }
    }

    for (const server of stopped) {
      const matchedProject = this.matchProject(server.port);
      for (const cb of this.onStoppedCallbacks) {
        cb(server, matchedProject);
      }
    }

    return [...currentMap.values()];
  }

  getActiveServers(): DevServerInfo[] {
    return [...this.previousServers.values()].filter((s) => s.isRunning);
  }

  matchProject(port: number): { id: string; name: string } | null {
    for (const project of this.projects) {
      if (project.devServerPorts.includes(port)) {
        return { id: project.id, name: project.name };
      }
    }
    return null;
  }

  private async scanPorts(): Promise<DevServerInfo[]> {
    const results = await Promise.all(
      this.config.ports.map(async (port) => {
        try {
          const result = await this.httpFetch(`http://localhost:${port}`, {
            timeoutMs: this.config.requestTimeoutMs,
          });
          return {
            port,
            url: `http://localhost:${port}`,
            isRunning: result.ok || result.status > 0,
          };
        } catch {
          return {
            port,
            url: `http://localhost:${port}`,
            isRunning: false,
          };
        }
      })
    );
    return results;
  }
}
