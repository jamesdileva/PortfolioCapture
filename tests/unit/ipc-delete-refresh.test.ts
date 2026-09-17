import { describe, it, expect, vi, beforeEach } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
}));

import { registerSessionHandlers } from "../../apps/desktop/electron/ipc/sessions.js";
import { registerProjectHandlers } from "../../apps/desktop/electron/ipc/projects.js";

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

describe("delete triggers portfolio refresh", () => {
  it("requests refresh after session delete", () => {
    const sessionService = { delete: vi.fn(() => true) };
    const onDeleted = vi.fn();
    registerSessionHandlers(
      sessionService as never,
      {} as never,
      {} as never,
      onDeleted,
    );

    const result = handlers.get("sessions:delete")!({}, "s1");

    expect(sessionService.delete).toHaveBeenCalledWith("s1");
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it("does not request refresh when session delete throws", () => {
    const sessionService = {
      delete: vi.fn(() => { throw new Error("Session nope not found"); }),
    };
    const onDeleted = vi.fn();
    registerSessionHandlers(
      sessionService as never,
      {} as never,
      {} as never,
      onDeleted,
    );

    expect(() => handlers.get("sessions:delete")!({}, "nope")).toThrow("not found");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("requests refresh after project delete", () => {
    const projectService = {
      list: vi.fn(() => []),
      getById: vi.fn(() => ({ id: "p1" })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(() => true),
    };
    const onChanged = vi.fn();
    const onDeleted = vi.fn();
    registerProjectHandlers(projectService as never, onChanged, onDeleted);

    const result = handlers.get("projects:delete")!({}, "p1");

    expect(projectService.delete).toHaveBeenCalledWith("p1");
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it("does not request refresh when project delete throws", () => {
    const projectService = {
      delete: vi.fn(() => { throw new Error("Project nope not found"); }),
    };
    const onDeleted = vi.fn();
    registerProjectHandlers(projectService as never, undefined, onDeleted);

    expect(() => handlers.get("projects:delete")!({}, "nope")).toThrow("not found");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
