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

  it("creates project with all metadata fields", () => {
    const input: CreateProjectInput = {
      name: "Metadata Project",
      path: "C:\\Metadata",
      description: "A test project with metadata",
      features: ["auth", "dashboard", "API"],
      techStack: ["React", "TypeScript", "Node.js"],
      githubUrl: "https://github.com/user/repo",
      projectStatus: "active",
    };
    const created = repo.create(input);

    expect(created.description).toBe("A test project with metadata");
    expect(created.features).toEqual(["auth", "dashboard", "API"]);
    expect(created.techStack).toEqual(["React", "TypeScript", "Node.js"]);
    expect(created.githubUrl).toBe("https://github.com/user/repo");
    expect(created.projectStatus).toBe("active");

    const found = repo.getById(created.id);
    expect(found!.description).toBe("A test project with metadata");
    expect(found!.features).toEqual(["auth", "dashboard", "API"]);
    expect(found!.techStack).toEqual(["React", "TypeScript", "Node.js"]);
    expect(found!.githubUrl).toBe("https://github.com/user/repo");
    expect(found!.projectStatus).toBe("active");
  });

  it("defaults metadata fields when not provided", () => {
    const created = repo.create({ name: "No Metadata", path: "C:\\NoMeta" });

    expect(created.description).toBeNull();
    expect(created.features).toEqual([]);
    expect(created.techStack).toEqual([]);
    expect(created.githubUrl).toBeNull();
    expect(created.projectStatus).toBe("active");
  });

  it("updates metadata fields", () => {
    const created = repo.create({ name: "Update Meta", path: "C:\\UpdateMeta" });

    const updated = repo.update(created.id, {
      description: "Updated description",
      features: ["new-feature"],
      techStack: ["Vue.js"],
      githubUrl: "https://github.com/user/new-repo",
      projectStatus: "archived",
    });

    expect(updated).not.toBeNull();
    expect(updated!.description).toBe("Updated description");
    expect(updated!.features).toEqual(["new-feature"]);
    expect(updated!.techStack).toEqual(["Vue.js"]);
    expect(updated!.githubUrl).toBe("https://github.com/user/new-repo");
    expect(updated!.projectStatus).toBe("archived");
  });

  it("handles empty arrays for features and techStack", () => {
    const created = repo.create({
      name: "Empty Arrays",
      path: "C:\\EmptyArrays",
      features: ["a", "b"],
      techStack: ["x"],
    });
    expect(created.features).toEqual(["a", "b"]);
    expect(created.techStack).toEqual(["x"]);

    const updated = repo.update(created.id, { features: [], techStack: [] });
    expect(updated!.features).toEqual([]);
    expect(updated!.techStack).toEqual([]);
  });

  it("handles null description and githubUrl on update", () => {
    const created = repo.create({
      name: "Null Fields",
      path: "C:\\NullFields",
      description: "has description",
      githubUrl: "https://github.com/user/repo",
    });

    const updated = repo.update(created.id, { description: null, githubUrl: null });
    expect(updated!.description).toBeNull();
    expect(updated!.githubUrl).toBeNull();
  });

  it("creates project with devServerPorts", () => {
    const created = repo.create({
      name: "Web App",
      path: "C:\\WebApp",
      devServerPorts: [3000, 5173],
    });
    expect(created.devServerPorts).toEqual([3000, 5173]);

    const found = repo.getById(created.id);
    expect(found!.devServerPorts).toEqual([3000, 5173]);
  });

  it("defaults devServerPorts to empty array", () => {
    const created = repo.create({ name: "No Ports", path: "C:\\NoPorts" });
    expect(created.devServerPorts).toEqual([]);
  });

  it("updates devServerPorts", () => {
    const created = repo.create({
      name: "Update Ports",
      path: "C:\\UpdatePorts",
      devServerPorts: [3000],
    });

    const updated = repo.update(created.id, { devServerPorts: [8080, 8000] });
    expect(updated!.devServerPorts).toEqual([8080, 8000]);
  });
});
