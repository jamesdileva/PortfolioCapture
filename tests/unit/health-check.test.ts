import { describe, it, expect, vi } from "vitest";
import { runHealthChecks } from "../../apps/desktop/electron/services/health-check";

function createMockDb(shouldFail = false) {
  return {
    prepare: vi.fn(() => ({
      get: shouldFail ? () => { throw new Error("DB locked"); } : () => ({ "1": 1 }),
    })),
  } as unknown as import("better-sqlite3").Database;
}

describe("runHealthChecks", () => {
  it("returns healthy when all checks pass", async () => {
    const db = createMockDb();
    const execFn = vi.fn(async () => ({ stdout: "ffmpeg version 6.0 Copyright (c) 2000-2023" }));
    const result = await runHealthChecks(db, { execFn });
    expect(result.status).toBe("healthy");
    expect(result.checks.length).toBeGreaterThanOrEqual(2);
    expect(result.checkedAt).toBeTruthy();
  });

  it("returns unhealthy when DB check fails", async () => {
    const db = createMockDb(true);
    const result = await runHealthChecks(db);
    expect(result.status).toBe("unhealthy");
    expect(result.checks.some((c) => c.name === "database" && c.status === "fail")).toBe(true);
  });

  it("returns degraded when ffmpeg not found", async () => {
    const db = createMockDb();
    const execFn = vi.fn(async () => { throw new Error("not found"); });
    const result = await runHealthChecks(db, { execFn });
    expect(result.status).toBe("degraded");
    expect(result.checks.some((c) => c.name === "ffmpeg" && c.status === "warn")).toBe(true);
  });

  it("includes migrations check when migrationsDir provided", async () => {
    const db = createMockDb();
    const execFn = vi.fn(async () => ({ stdout: "ffmpeg version 6.0" }));
    vi.doMock("fs", async () => {
      const actual = await vi.importActual<typeof import("fs")>("fs");
      return { ...actual, existsSync: () => true };
    });

    const result = await runHealthChecks(db, { execFn, migrationsDir: "/tmp/migrations" });
    expect(result.checks.some((c) => c.name === "migrations")).toBe(true);
  });

  it("skips migrations check when no migrationsDir", async () => {
    const db = createMockDb();
    const execFn = vi.fn(async () => ({ stdout: "ffmpeg version 6.0" }));
    const result = await runHealthChecks(db, { execFn });
    expect(result.checks.some((c) => c.name === "migrations")).toBe(false);
  });

  it("reports DB error message in check", async () => {
    const db = createMockDb(true);
    const result = await runHealthChecks(db);
    const dbCheck = result.checks.find((c) => c.name === "database");
    expect(dbCheck?.message).toContain("DB locked");
  });

  it("marks degraded when both DB pass and ffmpeg warn", async () => {
    const db = createMockDb();
    const execFn = vi.fn(async () => { throw new Error("not found"); });
    const result = await runHealthChecks(db, { execFn });
    expect(result.status).toBe("degraded");
  });
});
