import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project, RecordingSession, GitCommit } from "../../../packages/shared/types/index.js";
import { ProjectTimeline } from "@renderer/components/ProjectTimeline";

const project: Project = {
  id: "p1", name: "Test Project", path: "/code/test", executablePath: null, launchCommand: null,
  enabled: true, autoRecord: true, description: null, features: [], techStack: [],
  githubUrl: null, projectStatus: "active", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
};

const sessions: RecordingSession[] = [
  { id: "s1", projectId: "p1", startedAt: "2026-09-01T10:00:00Z", endedAt: "2026-09-01T10:05:00Z", status: "complete", trigger: "manual", durationMs: 300000, rawVideoPath: "/raw.mp4" },
  { id: "s2", projectId: "p1", startedAt: "2026-08-30T09:00:00Z", endedAt: "2026-08-30T09:02:00Z", status: "complete", trigger: "manual", durationMs: 120000, rawVideoPath: "/raw2.mp4" },
];

const commits: GitCommit[] = [
  { sha: "abc1234", message: "feat: add login", date: "2026-09-01T12:00:00+00:00", author: "Alice" },
  { sha: "def5678", message: "fix: resolve crash", date: "2026-08-29T08:00:00+00:00", author: "Bob" },
];

const mockLog = vi.fn();
const mockListByProject = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockLog.mockResolvedValue(commits);
  mockListByProject.mockResolvedValue([]);
  // @ts-expect-error mock
  window.portfolio = {
    git: { log: mockLog },
    assets: { listByProject: mockListByProject },
  };
});

describe("ProjectTimeline", () => {
  it("shows loading state initially", () => {
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    expect(screen.getByText("Loading timeline...")).toBeInTheDocument();
  });

  it("renders timeline heading after loading", async () => {
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Timeline")).toBeInTheDocument();
    });
  });

  it("shows empty state when no events exist", async () => {
    mockLog.mockResolvedValue([]);
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("No events yet for this project.")).toBeInTheDocument();
    });
  });

  it("displays git commits on timeline", async () => {
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("feat: add login")).toBeInTheDocument();
    });
    expect(screen.getByText("def5678")).toBeInTheDocument();
  });

  it("displays recording sessions on timeline", async () => {
    render(<ProjectTimeline project={project} sessions={sessions} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByText("Recording completed").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("groups events by date", async () => {
    render(<ProjectTimeline project={project} sessions={sessions} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Timeline")).toBeInTheDocument();
    });
    expect(screen.getByText(/Sep 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Aug 30, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Aug 29, 2026/)).toBeInTheDocument();
  });

  it("calls onSessionClick when recording event is clicked", async () => {
    let clickedId: string | null = null;
    render(
      <ProjectTimeline
        project={project}
        sessions={sessions}
        onSessionClick={(s) => { clickedId = s.id; }}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByText("Recording completed").length).toBeGreaterThanOrEqual(1);
    });
    screen.getAllByText("Recording completed")[0].click();
    expect(clickedId).toBe("s1");
  });

  it("handles git log failure gracefully", async () => {
    mockLog.mockRejectedValue(new Error("not a git repo"));
    render(<ProjectTimeline project={project} sessions={sessions} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Timeline")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Recording completed").length).toBeGreaterThanOrEqual(1);
  });

  it("handles assets list failure gracefully", async () => {
    mockListByProject.mockRejectedValue(new Error("db error"));
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Timeline")).toBeInTheDocument();
    });
  });

  it("renders demo events", async () => {
    mockListByProject.mockResolvedValue([
      { id: "a1", sessionId: "s1", projectId: "p1", type: "demo_video", path: "/demo.mp4", durationMs: 30000, width: 1920, height: 1080, fileSizeBytes: 5000000, createdAt: "2026-09-01T11:00:00Z" },
    ]);
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Demo generated")).toBeInTheDocument();
    });
  });

  it("renders screenshot events", async () => {
    mockListByProject.mockResolvedValue([
      { id: "a2", sessionId: "s1", projectId: "p1", type: "screenshot", path: "/shot.png", durationMs: null, width: 1920, height: 1080, fileSizeBytes: 500000, createdAt: "2026-09-01T11:05:00Z" },
    ]);
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Screenshot captured")).toBeInTheDocument();
    });
  });

  it("displays commit SHA prefix", async () => {
    render(<ProjectTimeline project={project} sessions={[]} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("abc1234")).toBeInTheDocument();
    });
  });

  it("displays recording duration", async () => {
    render(<ProjectTimeline project={project} sessions={sessions} onSessionClick={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("300s")).toBeInTheDocument();
    });
  });
});
