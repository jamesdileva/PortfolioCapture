import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WindowEnumeratorImpl } from "../../apps/desktop/electron/services/window-enumerator.js";
import type { ExecFn } from "../../apps/desktop/electron/services/window-enumerator.js";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockExec(output: string): ExecFn {
  return vi.fn().mockResolvedValue({ stdout: output, stderr: "" });
}

function failingExec(message: string): ExecFn {
  return vi.fn().mockRejectedValue(new Error(message));
}

describe("WindowEnumeratorImpl", () => {
  describe("listWindows", () => {
    it("returns parsed window list from PowerShell output", async () => {
      const windows = [
        { Title: "Visual Studio Code", Pid: 1234, Hwnd: "0x1A2B3" },
        { Title: "Google Chrome", Pid: 5678, Hwnd: "0x4C5D6" },
      ];
      const execFn = mockExec(JSON.stringify(windows));
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ title: "Visual Studio Code", pid: 1234, hwnd: "0x1A2B3" });
      expect(result[1]).toEqual({ title: "Google Chrome", pid: 5678, hwnd: "0x4C5D6" });
    });

    it("wraps single window in array", async () => {
      const window = { Title: "Notepad", Pid: 999, Hwnd: "0xABC" };
      const execFn = mockExec(JSON.stringify(window));
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Notepad");
    });

    it("filters out windows with empty titles", async () => {
      const windows = [
        { Title: "Visual Studio Code", Pid: 1, Hwnd: "0x1" },
        { Title: "", Pid: 2, Hwnd: "0x2" },
        { Title: "  ", Pid: 3, Hwnd: "0x3" },
      ];
      const execFn = mockExec(JSON.stringify(windows));
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Visual Studio Code");
    });

    it("returns empty array on PowerShell failure", async () => {
      const execFn = failingExec("Command failed");
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toEqual([]);
    });

    it("returns empty array on invalid JSON output", async () => {
      const execFn = mockExec("not json");
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toEqual([]);
    });

    it("returns empty array on empty output", async () => {
      const execFn = mockExec("");
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toEqual([]);
    });

    it("passes command to execFn", async () => {
      const execFn = mockExec("[]");
      const enumerator = new WindowEnumeratorImpl(execFn);

      await enumerator.listWindows();

      expect(execFn).toHaveBeenCalledTimes(1);
      const cmd = execFn.mock.calls[0][0] as string;
      expect(cmd).toContain("powershell");
      expect(cmd).toContain("EnumWindows");
    });

    it("handles array with single empty-title window", async () => {
      const windows = [{ Title: "", Pid: 1, Hwnd: "0x1" }];
      const execFn = mockExec(JSON.stringify(windows));
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toEqual([]);
    });

    it("preserves window titles with special characters", async () => {
      const windows = [
        { Title: "My App - Untitled (modified)", Pid: 100, Hwnd: "0x64" },
      ];
      const execFn = mockExec(JSON.stringify(windows));
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result[0].title).toBe("My App - Untitled (modified)");
    });

    it("handles large window lists", async () => {
      const windows = Array.from({ length: 50 }, (_, i) => ({
        Title: `Window ${i}`,
        Pid: 1000 + i,
        Hwnd: `0x${i.toString(16)}`,
      }));
      const execFn = mockExec(JSON.stringify(windows));
      const enumerator = new WindowEnumeratorImpl(execFn);

      const result = await enumerator.listWindows();

      expect(result).toHaveLength(50);
    });
  });
});
