import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import {
  ElectronWindowCaptureProvider,
  type ElectronCaptureHost,
} from "../../apps/desktop/electron/services/electron-capture-provider.js";
import type { CaptureOptions } from "../../packages/shared/types/index.js";

const SOURCES = [
  { id: "src-1", name: "My App" },
  { id: "src-2", name: "Other Window" },
];

function defaultOptions(): CaptureOptions {
  return {
    outputPath: "C:\\recordings\\test.mp4",
    fps: 30,
    width: 1280,
    height: 720,
    audio: "none",
    captureMode: "window",
    windowTitle: "My App",
  };
}

interface FakeHost extends ElectronCaptureHost {
  sent: Array<{ channel: string; args: unknown[] }>;
}

function makeHost(): FakeHost {
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  return {
    sent,
    sendToHost: vi.fn((channel: string, ...args: unknown[]) => {
      sent.push({ channel, args });
    }),
    loadPage: vi.fn(async () => undefined),
    waitReady: vi.fn(async () => undefined),
    isAlive: () => true,
    destroy: vi.fn(),
    onClosed: vi.fn(),
  };
}

function makeBus() {
  return new EventEmitter() as EventEmitter & {
    on(channel: string, listener: (...args: unknown[]) => void): void;
  };
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    getSources: async () => SOURCES,
    createHostWindow: () => makeHost(),
    pageUrl: "file:///capture.html?capture=1",
    eventBus: makeBus(),
    remuxFn: async () => undefined,
    appendChunkFn: vi.fn(),
    statFn: () => 123456,
    unlinkFn: vi.fn(),
    startTimeoutMs: 2000,
    stopTimeoutMs: 2000,
    ...overrides,
  };
}

describe("ElectronWindowCaptureProvider", () => {
  it("rejects non-window capture requests", async () => {
    const provider = new ElectronWindowCaptureProvider(baseOptions());
    await expect(
      provider.start({ ...defaultOptions(), captureMode: "desktop", windowTitle: undefined }),
    ).rejects.toThrow("requires window mode");
  });

  it("rejects unknown window titles", async () => {
    const provider = new ElectronWindowCaptureProvider(baseOptions());
    await expect(
      provider.start({ ...defaultOptions(), windowTitle: "Gone App" }),
    ).rejects.toThrow("not found");
  });

  it("rejects concurrent starts while busy", async () => {
    const bus = makeBus();
    const createHostWindow = () => {
      const host = makeHost();
      setTimeout(() => bus.emit("capture-host:started", {}, { mimeType: "video/webm" }), 5);
      return host;
    };
    const provider = new ElectronWindowCaptureProvider(baseOptions({ eventBus: bus, createHostWindow }));
    const first = provider.start(defaultOptions());
    await expect(provider.start(defaultOptions())).rejects.toThrow("busy");
    const session = await first;
    const stopPromise = provider.stop(session.sessionId);
    setTimeout(() => bus.emit("capture-host:stopped", {}, -1), 5);
    await stopPromise;
  });

  it("records chunks and remuxes on stop", async () => {
    const bus = makeBus();
    const appended: Array<{ path: string; bytes: ArrayBuffer }> = [];
    const remuxed: Array<{ webm: string; mp4: string }> = [];
    const createHostWindow = () => {
      const host = makeHost();
      setTimeout(() => bus.emit("capture-host:started", {}, { mimeType: "video/webm" }), 5);
      return host;
    };
    const provider = new ElectronWindowCaptureProvider(
      baseOptions({
        eventBus: bus,
        createHostWindow,
        appendChunkFn: (path: string, bytes: ArrayBuffer) => {
          appended.push({ path, bytes });
        },
        remuxFn: async (webm: string, mp4: string) => {
          remuxed.push({ webm, mp4 });
        },
        statFn: () => 777,
      }),
    );

    const session = await provider.start(defaultOptions());
    bus.emit("capture-host:chunk", {}, new ArrayBuffer(8), 0);
    bus.emit("capture-host:chunk", {}, new ArrayBuffer(8), 1);
    const stopPromise = provider.stop(session.sessionId);
    setTimeout(() => bus.emit("capture-host:stopped", {}, 1), 5);
    const result = await stopPromise;

    expect(appended).toHaveLength(2);
    expect(appended[0].path).toContain(".capture.webm");
    expect(remuxed).toHaveLength(1);
    expect(remuxed[0].mp4).toBe("C:\\recordings\\test.mp4");
    expect(result.outputPath).toBe("C:\\recordings\\test.mp4");
    expect(result.fileSizeBytes).toBe(777);
    expect(result.width).toBe(1280);
  });

  it("surfaces renderer errors", async () => {
    const bus = makeBus();
    const provider = new ElectronWindowCaptureProvider(baseOptions({ eventBus: bus }));
    const startPromise = provider.start(defaultOptions());
    setTimeout(() => bus.emit("capture-host:error", {}, "getUserMedia denied"), 5);
    await expect(startPromise).rejects.toThrow("getUserMedia denied");
  });

  it("throws when stopping an unknown session", async () => {
    const provider = new ElectronWindowCaptureProvider(baseOptions());
    await expect(provider.stop("nope")).rejects.toThrow("No active capture session");
  });

  it("matches window titles case-insensitively by substring", async () => {
    const bus = makeBus();
    let sentStart: unknown = null;
    const createHostWindow = () => {
      const host = makeHost();
      const orig = host.sendToHost.bind(host);
      host.sendToHost = ((channel: string, ...args: unknown[]) => {
        if (channel === "capture-host:start") sentStart = args[0];
        (orig as (...a: unknown[]) => void)(channel, ...args);
      }) as never;
      setTimeout(() => bus.emit("capture-host:started", {}, { mimeType: "video/webm" }), 5);
      return host;
    };
    const provider = new ElectronWindowCaptureProvider(baseOptions({ eventBus: bus, createHostWindow }));
    const session = await provider.start({ ...defaultOptions(), windowTitle: "other" });
    expect(sentStart).toMatchObject({ sourceId: "src-2" });
    const stopPromise = provider.stop(session.sessionId);
    setTimeout(() => bus.emit("capture-host:stopped", {}, -1), 5);
    await stopPromise;
  });
});
