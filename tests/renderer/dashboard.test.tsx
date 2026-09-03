import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project, RecordingSession, MediaAsset } from "../../../packages/shared/types/index.js";
import { Dashboard } from "@renderer/components/Dashboard";

const projects: Project[] = [
  { id: "p1", name: "Portfolio Capture", path: "/code/pc", executablePath: null, launchCommand: null, enabled: true, autoRecord: true, description: null, features: [], techStack: [], githubUrl: null, projectStatus: "active", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
  { id: "p2", name: "Old App", path: "/code/old", executablePath: null, launchCommand: null, enabled: false, autoRecord: false, description: null, features: [], techStack: [], githubUrl: null, projectStatus: "archived", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" },
];

const sessions: RecordingSession[] = [
  { id: "s1", projectId: "p1", startedAt: "2026-09-01T10:30:00Z", endedAt: "2026-09-01T10:35:00Z", status: "complete", trigger: "manual", durationMs: 300000, rawVideoPath: "/raw.mp4" },
  { id: "s2", projectId: "p1", startedAt: "2026-09-01T12:00:00Z", endedAt: "2026-09-01T12:02:00Z", status: "complete", trigger: "manual", durationMs: 120000, rawVideoPath: "/raw2.mp4" },
  { id: "s3", projectId: "p2", startedAt: "2026-08-30T09:00:00Z", endedAt: "2026-08-30T09:01:00Z", status: "complete", trigger: "manual", durationMs: 60000, rawVideoPath: "/raw3.mp4" },
];

const demoAsset: MediaAsset = { id: "a1", sessionId: "s1", projectId: "p1", type: "demo_video", path: "/demo.mp4", durationMs: 30000, width: 1920, height: 1080, fileSizeBytes: 5000000, createdAt: "2026-09-01T11:00:00Z" };
const screenshotAsset: MediaAsset = { id: "a2", sessionId: "s1", projectId: "p1", type: "screenshot", path: "/shot.png", durationMs: null, width: 1920, height: 1080, fileSizeBytes: 500000, createdAt: "2026-09-01T11:05:00Z" };

const mockListByProject = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListByProject.mockImplementation(async (projectId: string) => {
    if (projectId === "p1") return [demoAsset, screenshotAsset];
    return [];
  });
  // @ts-expect-error mock
  window.portfolio = {
    assets: { listByProject: mockListByProject },
  };
});

describe("Dashboard", () => {
  it("renders dashboard heading", () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders stat cards with correct counts", () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    const twos = screen.getAllByText("2");
    expect(twos.length).toBe(2); // Projects=2, Active=2
    expect(screen.getByText("3")).toBeInTheDocument(); // Total Captures
  });

  it("renders project cards with capture counts", () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    expect(screen.getByText("Portfolio Capture")).toBeInTheDocument();
    expect(screen.getByText("Old App")).toBeInTheDocument();
    expect(screen.getByText("2 captures")).toBeInTheDocument();
    expect(screen.getByText("1 capture")).toBeInTheDocument();
  });

  it("shows last activity date on project cards", () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    expect(screen.getByText(/Last: Sep 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Last: Aug 30, 2026/)).toBeInTheDocument();
  });

  it("shows No captures for projects without sessions", () => {
    render(<Dashboard projects={projects} sessions={[]} onProjectClick={() => {}} onSessionClick={() => {}} />);
    expect(screen.getAllByText("No captures").length).toBe(2);
  });

  it("calls onProjectClick when project card is clicked", () => {
    let clicked: Project | null = null;
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={(p) => { clicked = p; }} onSessionClick={() => {}} />);
    screen.getByText("Portfolio Capture").click();
    expect(clicked).not.toBeNull();
    expect(clicked!.id).toBe("p1");
  });

  it("renders recent demos after loading", async () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Recent Demos")).toBeInTheDocument();
    });
    expect(screen.queryByText("No demos yet.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Portfolio Capture").length).toBeGreaterThanOrEqual(1);
  });

  it("renders recent screenshots after loading", async () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Recent Screenshots")).toBeInTheDocument();
    });
    expect(screen.queryByText("No screenshots yet.")).not.toBeInTheDocument();
  });

  it("shows empty state for projects", () => {
    render(<Dashboard projects={[]} sessions={[]} onProjectClick={() => {}} onSessionClick={() => {}} />);
    expect(screen.getByText("No projects yet. Add a project to get started.")).toBeInTheDocument();
  });

  it("shows loading state for assets initially", () => {
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    expect(screen.getAllByText("Loading...").length).toBeGreaterThanOrEqual(2);
  });

  it("shows No demos when no demo assets exist", async () => {
    mockListByProject.mockResolvedValue([]);
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No demos yet.")).toBeInTheDocument();
  });

  it("shows No screenshots when no screenshot assets exist", async () => {
    mockListByProject.mockResolvedValue([]);
    render(<Dashboard projects={projects} sessions={sessions} onProjectClick={() => {}} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No screenshots yet.")).toBeInTheDocument();
  });
});
