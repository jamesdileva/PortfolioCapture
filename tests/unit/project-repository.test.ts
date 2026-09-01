import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTestDatabase } from "../helpers/database.js";
import { ProjectRepository } from "../../packages/database/repositories/project-repository.js";
import type { CreateProjectInput } from "../../packages/shared/types/index.js";

describe("ProjectRepository", () => {
  let db: Database.Database;
  let repo: ProjectRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new ProjectRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates a project and retrieves it by id", () => {
    const input: CreateProjectInput = {
      name: "Test Project",
      path: "C:\\Projects\\TestProject",
    };
    const created = repo.create(input);

    expect(created.id).toBeDefined();
    expect(created.name).toBe("Test Project");
    expect(created.path).toBe("C:\\Projects\\TestProject");
    expect(created.enabled).toBe(true);
    expect(created.autoRecord).toBe(true);

    const found = repo.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Project");
  });

  it("lists projects ordered by created_at desc", () => {
    const first = repo.create({ name: "First", path: "C:\\First" });
    // Manually set an earlier timestamp to ensure ordering
    db.prepare("UPDATE projects SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", first.id);
    repo.create({ name: "Second", path: "C:\\Second" });

    const projects = repo.list();
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe("Second");
    expect(projects[1].name).toBe("First");
  });

  it("updates a project", () => {
    const created = repo.create({ name: "Original", path: "C:\\Original" });
    // Manually set an earlier timestamp to ensure updatedAt changes
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", created.id);

    const updated = repo.update(created.id, { name: "Updated", enabled: false });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
    expect(updated!.enabled).toBe(false);
    expect(updated!.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("returns null when updating nonexistent project", () => {
    const result = repo.update("nonexistent-id", { name: "X" });
    expect(result).toBeNull();
  });

  it("deletes a project", () => {
    const created = repo.create({ name: "ToDelete", path: "C:\\Delete" });
    const deleted = repo.delete(created.id);
    expect(deleted).toBe(true);
    expect(repo.getById(created.id)).toBeNull();
  });

  it("returns false when deleting nonexistent project", () => {
    const deleted = repo.delete("nonexistent-id");
    expect(deleted).toBe(false);
  });

  it("handles all optional fields", () => {
    const input: CreateProjectInput = {
      name: "Full",
      path: "C:\\Full",
      executablePath: "C:\\Full\\app.exe",
      launchCommand: "npm start",
      enabled: false,
      autoRecord: false,
    };
    const created = repo.create(input);

    expect(created.executablePath).toBe("C:\\Full\\app.exe");
    expect(created.launchCommand).toBe("npm start");
    expect(created.enabled).toBe(false);
    expect(created.autoRecord).toBe(false);
  });

  it("round-trips create → read → update → delete", () => {
    const created = repo.create({ name: "RoundTrip", path: "C:\\RoundTrip" });
    const read = repo.getById(created.id);
    expect(read!.name).toBe("RoundTrip");

    const updated = repo.update(created.id, { name: "RoundTrip Updated" });
    expect(updated!.name).toBe("RoundTrip Updated");

    const deleted = repo.delete(created.id);
    expect(deleted).toBe(true);
    expect(repo.getById(created.id)).toBeNull();
  });
});
