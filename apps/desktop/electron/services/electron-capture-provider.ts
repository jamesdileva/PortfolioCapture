import { appendFileSync, statSync, unlinkSync } from "fs";
import { spawn, type ChildProcess } from "child_process";
import { ipcMain } from "electron";
import type {
  CaptureOptions,
  CaptureProvider,
  CaptureResult,
  CaptureSession,
} from "../../../../packages/shared/types/index.js";

export interface ElectronCaptureSource {
  id: string;
  name: string;
}

export interface ElectronCaptureHost {
  sendToHost(channel: string, ...args: unknown[]): void;
  loadPage(url: string): Promise<void>;
  waitReady(): Promise<void>;
  isAlive(): boolean;
  destroy(): void;
  onClosed(callback: () => void): void;
}

export interface ElectronEventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(channel: string, listener: (...args: any[]) => void): void;
}

export interface ElectronCaptureProviderOptions {
  getSources: () => Promise<ElectronCaptureSource[]>;
  createHostWindow: () => ElectronCaptureHost;
  pageUrl: string;
  eventBus?: ElectronEventBus;
  ffmpegPath?: string;
  remuxFn?: (webmPath: string, mp4Path: string) => Promise<void>;
  appendChunkFn?: (path: string, bytes: ArrayBuffer) => void;
  statFn?: (path: string) => number;
  unlinkFn?: (path: string) => void;
  logger?: (message: string) => void;
  startTimeoutMs?: number;
  stopTimeoutMs?: number;
}

interface ActiveElectronCapture {
  sessionId: string;
  startedAt: string;
  outputPath: string;
  webmPath: string;
  options: CaptureOptions;
  receivedChunks: number;
  lastSeq: number | null;
  stoppedAck: boolean;
  stopError: string | null;
}

let sessionCounter = 0;

function generateSessionId(): string {
  sessionCounter++;
  return `electron-capture-${Date.now()}-${sessionCounter}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function defaultRemux(ffmpegPath: string): (webmPath: string, mp4Path: string) => Promise<void> {
  return (webmPath, mp4Path) =>
    new Promise<void>((resolve, reject) => {
      let proc: ChildProcess;
      try {
        proc = spawn(ffmpegPath, [
          "-y",
          "-i", webmPath,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-an",
          mp4Path,
        ]);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 4096) stderr = stderr.slice(-4096);
      });
      proc.on("error", (err) => reject(new Error(`FFmpeg remux failed to start: ${err.message}`)));
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(`FFmpeg remux exited with code ${code}: ${stderr.trim().slice(0, 300)}`));
        else resolve();
      });
    });
}

/**
 * Window capture through Chromium's own capture stack (sees GPU-composited
 * pixels that GDI scraping returns blank for). Records in a hidden renderer
 * window via MediaRecorder, then remuxes to h264 mp4. Window mode only —
 * desktop capture stays on FFmpeg. Serial use: one capture at a time.
 */
export class ElectronWindowCaptureProvider implements CaptureProvider {
  private getSources: () => Promise<ElectronCaptureSource[]>;
  private createHostWindow: () => ElectronCaptureHost;
  private pageUrl: string;
  private ffmpegPath: string;
  private remuxFn: (webmPath: string, mp4Path: string) => Promise<void>;
  private appendChunkFn: (path: string, bytes: ArrayBuffer) => void;
  private statFn: (path: string) => number;
  private unlinkFn: (path: string) => void;
  private logger: (message: string) => void;
  private startTimeoutMs: number;
  private stopTimeoutMs: number;
  private eventBus: ElectronEventBus;

  private host: ElectronCaptureHost | null = null;
  private hostReady: Promise<void> | null = null;
  private active: ActiveElectronCapture | null = null;
  private starting = false;
  private startWaiters: Array<{ resolve: (mimeType: string) => void; reject: (err: Error) => void }> = [];
  private stopWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private subscribed = false;

  constructor(options: ElectronCaptureProviderOptions) {
    this.getSources = options.getSources;
    this.createHostWindow = options.createHostWindow;
    this.pageUrl = options.pageUrl;
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.remuxFn = options.remuxFn ?? defaultRemux(this.ffmpegPath);
    this.appendChunkFn =
      options.appendChunkFn ??
      ((path, bytes) => appendFileSync(path, Buffer.from(bytes)));
    this.statFn =
      options.statFn ??
      ((path) => {
        try {
          return statSync(path).size;
        } catch {
          return 0;
        }
      });
    this.unlinkFn =
      options.unlinkFn ??
      ((path) => {
        try {
          unlinkSync(path);
        } catch {
          // best-effort temp cleanup
        }
      });
    this.logger = options.logger ?? (() => {});
    this.startTimeoutMs = options.startTimeoutMs ?? 15000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 20000;
    this.eventBus = options.eventBus ?? ipcMain;
    this.subscribe();
  }

  async start(options: CaptureOptions): Promise<CaptureSession> {
    if (this.active || this.starting) {
      throw new Error("Electron capture host is busy with another session");
    }
    if (options.captureMode !== "window" || !options.windowTitle?.trim()) {
      throw new Error("Electron capture requires window mode with a window title");
    }
    // Claim synchronously: the awaits below yield, and a concurrent start
    // must not slip through before this.active is set.
    this.starting = true;
    try {
      return await this.startInner(options);
    } finally {
      this.starting = false;
    }
  }

  private async startInner(options: CaptureOptions): Promise<CaptureSession> {
    const configuredTitle = options.windowTitle ?? "";
    const needle = configuredTitle.trim().toLowerCase();
    const sources = await this.getSources();
    const source =
      sources.find((s) => s.name.toLowerCase() === needle) ??
      sources.find((s) => s.name.toLowerCase().includes(needle));
    if (!source) {
      throw new Error(`Window "${configuredTitle.trim()}" not found for Electron capture`);
    }

    const host = await this.ensureHost();
    const sessionId = generateSessionId();
    const startedAt = new Date().toISOString();
    const webmPath = options.outputPath.replace(/\.mp4$/i, "") + ".capture.webm";
    try {
      this.unlinkFn(webmPath);
    } catch {
      // ignore missing temp
    }
    this.active = {
      sessionId,
      startedAt,
      outputPath: options.outputPath,
      webmPath,
      options,
      receivedChunks: 0,
      lastSeq: null,
      stoppedAck: false,
      stopError: null,
    };

    try {
      host.sendToHost("capture-host:start", {
        sourceId: source.id,
        fps: options.fps,
        width: options.width,
        height: options.height,
      });
      await withTimeout(
        new Promise<string>((resolve, reject) => {
          this.startWaiters.push({ resolve, reject });
        }),
        this.startTimeoutMs,
        `Electron capture did not start within ${this.startTimeoutMs}ms`,
      );
    } catch (err) {
      this.active = null;
      throw err;
    }

    return { sessionId, startedAt };
  }

  async stop(sessionId: string): Promise<CaptureResult> {
    const active = this.active;
    if (!active || active.sessionId !== sessionId) {
      throw new Error(`No active capture session: ${sessionId}`);
    }

    const host = await this.ensureHost();
    try {
      host.sendToHost("capture-host:stop");
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          this.stopWaiters.push({ resolve, reject });
        }),
        this.stopTimeoutMs,
        `Electron capture did not stop within ${this.stopTimeoutMs}ms`,
      );
    } catch (err) {
      this.active = null;
      throw err;
    }

    if (active.stopError) {
      this.active = null;
      throw new Error(`Electron capture failed: ${active.stopError}`);
    }

    await this.waitForChunks(active, 10000);

    try {
      await this.remuxFn(active.webmPath, active.outputPath);
    } finally {
      this.unlinkFn(active.webmPath);
    }

    const durationMs = Date.now() - new Date(active.startedAt).getTime();
    const fileSizeBytes = this.statFn(active.outputPath);
    this.active = null;
    return {
      outputPath: active.outputPath,
      durationMs,
      fileSizeBytes,
      width: active.options.width,
      height: active.options.height,
    };
  }

  private async waitForChunks(active: ActiveElectronCapture, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (active.lastSeq != null && active.receivedChunks > active.lastSeq) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    this.logger(
      `electron capture session=${active.sessionId} finalized with ${active.receivedChunks} chunks (expected past seq ${active.lastSeq})`,
    );
  }

  private async ensureHost(): Promise<ElectronCaptureHost> {
    if (this.host && this.host.isAlive()) {
      if (this.hostReady) await this.hostReady;
      return this.host;
    }
    const host = this.createHostWindow();
    this.host = host;
    host.onClosed(() => {
      if (this.host === host) {
        this.host = null;
        this.hostReady = null;
      }
      if (this.active) {
        const err = new Error("Electron capture host closed unexpectedly");
        this.startWaiters.splice(0).forEach((w) => w.reject(err));
        this.stopWaiters.splice(0).forEach((w) => w.reject(err));
        this.active = null;
      }
    });
    this.hostReady = (async () => {
      await host.loadPage(this.pageUrl);
      await host.waitReady();
    })();
    await this.hostReady;
    return host;
  }

  private subscribe(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    const bus = this.eventBus;

    bus.on("capture-host:chunk", (_event, bytes: ArrayBuffer, seq: number) => {
      if (!this.active) return;
      try {
        this.appendChunkFn(this.active.webmPath, bytes);
        this.active.receivedChunks += 1;
        void seq;
      } catch (err) {
        this.logger(`electron capture chunk write failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    bus.on("capture-host:started", (_event, info: { mimeType: string }) => {
      this.logger(`electron capture started (${info?.mimeType ?? "unknown mime"})`);
      this.startWaiters.splice(0).forEach((w) => w.resolve(info?.mimeType ?? ""));
    });

    bus.on("capture-host:stopped", (_event, lastSeq: number) => {
      if (this.active) this.active.lastSeq = typeof lastSeq === "number" ? lastSeq : 0;
      this.stopWaiters.splice(0).forEach((w) => w.resolve());
    });

    bus.on("capture-host:error", (_event, message: string) => {
      const err = new Error(typeof message === "string" && message ? message : "Electron capture error");
      if (this.active) this.active.stopError = err.message;
      this.startWaiters.splice(0).forEach((w) => w.reject(err));
      this.stopWaiters.splice(0).forEach((w) => w.reject(err));
    });
  }
}
