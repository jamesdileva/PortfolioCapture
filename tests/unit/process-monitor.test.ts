import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProcessMonitor } from "../../apps/desktop/electron/services/process-monitor.js";
import type { DetectedProcess, ExecFn } from "../../apps/desktop/electron/services/process-monitor.js";

function createMockExec(): ExecFn & { mock: ReturnType<typeof vi.fn> } {
  const fn = vi.fn() as ExecFn & { mock: ReturnType<typeof vi.fn> };
  fn.mock = fn as unknown as ReturnType<typeof vi.fn>;
  return fn;
}

function mockProcessList(mockExec: ExecFn, processes: { ProcessId: number; Name: string; ExecutablePath?: string | null }[]): void {
  (mockExec as ReturnType<typeof vi.fn>).mockResolvedValue({
    stdout: JSON.stringify(processes),
    stderr: "",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProcessMonitor", () => {
  describe("constructor", () => {
    it("creates with default config", () => {
      const monitor = new ProcessMonitor();
      expect(monitor).toBeDefined();
    });

    it("creates with custom config", () => {
      const monitor = new ProcessMonitor({ pollIntervalMs: 500 });
      expect(monitor).toBeDefined();
    });
  });

  describe("callbacks", () => {
    it("fires onProcessStarted for new processes", async () => {
      const mockExec = vi.fn();
      const monitor = new ProcessMonitor({}, mockExec);
      const started: DetectedProcess[] = [];

      monitor.onProcessStarted((proc) => started.push(proc));

      mockExec.mockResolvedValue({
        stdout: JSON.stringify([{ ProcessId: 100, Name: "notepad.exe", ExecutablePath: "C:\\Windows\\notepad.exe" }]),
        stderr: "",
      });
      await monitor.poll();

      expect(started).toHaveLength(1);
      expect(started[0].pid).toBe(100);
      expect(started[0].name).toBe("notepad.exe");
    });

    it("fires onProcessStopped for removed processes", async () => {
      const mockExec = vi.fn();
      const monitor = new ProcessMonitor({}, mockExec);
      const stopped: DetectedProcess[] = [];

      monitor.onProcessStopped((proc) => stopped.push(proc));

      mockExec.mockResolvedValue({
        stdout: JSON.stringify([{ ProcessId: 100, Name: "notepad.exe" }]),
        stderr: "",
      });
      await monitor.poll();

      mockExec.mockResolvedValue({ stdout: "[]", stderr: "" });
      await monitor.poll();

      expect(stopped).toHaveLength(1);
      expect(stopped[0].pid).toBe(100);
    });

    it("does not fire for unchanged processes", async () => {
      const mockExec = vi.fn();
      const monitor = new ProcessMonitor({}, mockExec);
      const started: DetectedProcess[] = [];
      const stopped: DetectedProcess[] = [];

      monitor.onProcessStarted((proc) => started.push(proc));
      monitor.onProcessStopped((proc) => stopped.push(proc));

      const processList = JSON.stringify([{ ProcessId: 100, Name: "notepad.exe" }]);
      mockExec.mockResolvedValue({ stdout: processList, stderr: "" });
      await monitor.poll();

      mockExec.mockResolvedValue({ stdout: processList, stderr: "" });
      await monitor.poll();

      expect(started).toHaveLength(1);
      expect(stopped).toHaveLength(0);
    });

    it("supports multiple callbacks", async () => {
      const mockExec = vi.fn();
      const monitor = new ProcessMonitor({}, mockExec);
      const started1: DetectedProcess[] = [];
      const started2: DetectedProcess[] = [];

      monitor.onProcessStarted((proc) => started1.push(proc));
      monitor.onProcessStarted((proc) => started2.push(proc));

      mockExec.mockResolvedValue({
        stdout: JSON.stringify([{ ProcessId: 100, Name: "notepad.exe" }]),
        stderr: "",
      });
      await monitor.poll();

      expect(started1).toHaveLength(1);
      expect(started2).toHaveLength(1);
    });
  });

  describe("poll", () => {
    it("returns current process list", async () => {
      const mockExec = vi.fn();
      const monitor = new ProcessMonitor({}, mockExec);

      mockExec.mockResolvedValue({
        stdout: JSON.stringify([
          { ProcessId: 100, Name: "notepad.exe" },
          { ProcessId: 200, Name: "chrome.exe" },
        ]),
        stderr: "",
      });

      const processes = await monitor.poll();
      expect(processes).toHaveLength(2);
    });

    it("returns empty array on exec error", async () => {
      const mockExec = vi.fn();
      const monitor = new ProcessMonitor({}, mockExec);
      mockExec.mockRejectedValue(new Error("command failed"));

      const processes = await monitor.poll();
      expect(processes).toHaveLength(0);
    });
  });

  describe("matchProject", () => {
    it("matches by executable path filename", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([
        { id: "p1", executablePath: "C:\\Program Files\\Game\\game.exe", name: "Game" },
      ]);

      const proc: DetectedProcess = { pid: 100, name: "game.exe", executablePath: "D:\\Other\\game.exe" };
      const match = monitor.matchProject(proc);

      expect(match).toEqual({ id: "p1", name: "Game" });
    });

    it("matches by exact executable path", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([
        { id: "p1", executablePath: "C:\\Program Files\\Game\\game.exe", name: "Game" },
      ]);

      const proc: DetectedProcess = {
        pid: 100,
        name: "game.exe",
        executablePath: "C:\\Program Files\\Game\\game.exe",
      };
      const match = monitor.matchProject(proc);

      expect(match).toEqual({ id: "p1", name: "Game" });
    });

    it("returns null when no match", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([
        { id: "p1", executablePath: "C:\\Program Files\\Game\\game.exe", name: "Game" },
      ]);

      const proc: DetectedProcess = { pid: 100, name: "other.exe", executablePath: null };
      const match = monitor.matchProject(proc);

      expect(match).toBeNull();
    });

    it("returns null when project has no executablePath", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([{ id: "p1", executablePath: null, name: "Game" }]);

      const proc: DetectedProcess = { pid: 100, name: "game.exe", executablePath: null };
      const match = monitor.matchProject(proc);

      expect(match).toBeNull();
    });

    it("case-insensitive match", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([
        { id: "p1", executablePath: "C:\\Games\\MyGame.EXE", name: "Game" },
      ]);

      const proc: DetectedProcess = { pid: 100, name: "mygame.exe", executablePath: null };
      const match = monitor.matchProject(proc);

      expect(match).toEqual({ id: "p1", name: "Game" });
    });

    it("prefers exact path match over name match", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([
        { id: "p1", executablePath: "C:\\Games\\game.exe", name: "Game1" },
        { id: "p2", executablePath: "D:\\Other\\game.exe", name: "Game2" },
      ]);

      const proc: DetectedProcess = {
        pid: 100,
        name: "game.exe",
        executablePath: "D:\\Other\\game.exe",
      };
      const match = monitor.matchProject(proc);

      expect(match).toEqual({ id: "p2", name: "Game2" });
    });
  });

  describe("setProjects", () => {
    it("updates project list", () => {
      const monitor = new ProcessMonitor();
      monitor.setProjects([{ id: "p1", executablePath: "C:\\game.exe", name: "Game" }]);

      const proc: DetectedProcess = { pid: 100, name: "game.exe", executablePath: null };
      expect(monitor.matchProject(proc)).toEqual({ id: "p1", name: "Game" });

      monitor.setProjects([]);
      expect(monitor.matchProject(proc)).toBeNull();
    });
  });

  describe("start/stop lifecycle", () => {
    it("can start and stop", async () => {
      const mockExec = vi.fn();
      mockExec.mockResolvedValue({ stdout: "[]", stderr: "" });
      const monitor = new ProcessMonitor({ pollIntervalMs: 100 }, mockExec);

      await monitor.start();
      await monitor.stop();
    });

    it("does not start twice", async () => {
      const mockExec = vi.fn();
      mockExec.mockResolvedValue({ stdout: "[]", stderr: "" });
      const monitor = new ProcessMonitor({ pollIntervalMs: 100 }, mockExec);

      await monitor.start();
      await monitor.start();

      await monitor.stop();
    });

    it("handles stop before start", async () => {
      const monitor = new ProcessMonitor();
      await monitor.stop();
    });
  });
});
