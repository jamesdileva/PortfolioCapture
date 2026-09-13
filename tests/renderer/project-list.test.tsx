import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import type { Project } from "../../../packages/shared/types/index.js";
import { ProjectList } from "@renderer/components/ProjectList";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Demo App",
    path: "C:\\Projects\\demo",
    executablePath: null,
    launchCommand: null,
    enabled: true,
    autoRecord: true,
    description: null,
    features: [],
    techStack: [],
    githubUrl: null,
    devServerPorts: [],
    captureMode: "desktop",
    windowTitle: null,
    projectStatus: "active",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function renderList(projects: Project[], recordingIds: Set<string> = new Set()) {
  const handlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onAdd: vi.fn(),
    onRecord: vi.fn(),
    onStop: vi.fn(),
  };
  render(
    <ProjectList
      projects={projects}
      recordingIds={recordingIds}
      onEdit={handlers.onEdit}
      onDelete={handlers.onDelete}
      onAdd={handlers.onAdd}
      onRecord={handlers.onRecord}
      onStop={handlers.onStop}
    />
  );
  return handlers;
}

describe("ProjectList", () => {
  it("shows empty state with Add Project button", () => {
    const handlers = renderList([]);
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
    screen.getByText("Add Project").click();
    expect(handlers.onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows Record button and Manual only status when no trigger configured", () => {
    const handlers = renderList([makeProject()]);
    expect(screen.getByText("Manual only")).toBeInTheDocument();
    screen.getByText("● Record").click();
    expect(handlers.onRecord).toHaveBeenCalledTimes(1);
    expect(handlers.onRecord.mock.calls[0][0].id).toBe("p1");
  });

  it("shows Watching status when executable path is configured", () => {
    renderList([makeProject({ executablePath: "C:\\Projects\\demo\\app.exe" })]);
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("shows Watching status when dev server ports are configured", () => {
    renderList([makeProject({ devServerPorts: [3000, 5173] })]);
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("shows Stop button and Recording status for active recordings", () => {
    const handlers = renderList([makeProject()], new Set(["p1"]));
    expect(screen.getByText("● Recording")).toBeInTheDocument();
    expect(screen.queryByText("● Record")).not.toBeInTheDocument();
    screen.getByText("■ Stop").click();
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it("disables Record and shows Disabled status when project is disabled", () => {
    renderList([makeProject({ enabled: false, executablePath: "C:\\a\\b.exe" })]);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("● Record")).toBeDisabled();
  });

  it("still calls edit and delete handlers", () => {
    const handlers = renderList([makeProject()]);
    screen.getByText("Edit").click();
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
    screen.getByText("Delete").click();
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows the bound window when capture is window-scoped", () => {
    renderList([makeProject({ captureMode: "window", windowTitle: "My App — Dashboard" })]);
    expect(screen.getByText(/🪟 My App — Dashboard/)).toBeInTheDocument();
  });

  it("shows no window label for desktop capture", () => {
    renderList([makeProject()]);
    expect(screen.queryByText(/🪟/)).not.toBeInTheDocument();
  });
});
