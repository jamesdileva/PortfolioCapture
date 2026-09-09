import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecordingSession, Project, MediaAsset } from "../../../packages/shared/types/index.js";
import { SessionDetail } from "@renderer/components/SessionDetail";

const project: Project = {
  id: "p1", name: "My App", path: "/code/app", executablePath: null, launchCommand: null,
  enabled: true, autoRecord: true, createdAt: "", updatedAt: "",
};

const completeSession: RecordingSession = {
  id: "s1", projectId: "p1", startedAt: "2026-09-01T10:30:00Z", endedAt: "2026-09-01T10:35:00Z",
  status: "complete", trigger: "manual", durationMs: 300000, rawVideoPath: "/rec/s1/raw.mp4",
};

const recordingSession: RecordingSession = {
  id: "s2", projectId: "p1", startedAt: "2026-09-01T12:00:00Z", endedAt: null,
  status: "recording", trigger: "process_launch", durationMs: null, rawVideoPath: null,
};

const assets: MediaAsset[] = [
  { id: "a1", sessionId: "s1", projectId: "p1", type: "raw_video", path: "/rec/s1/raw.mp4", durationMs: 300000, width: 1920, height: 1080, fileSizeBytes: 50000000, createdAt: "" },
  { id: "a2", sessionId: "s1", projectId: "p1", type: "thumbnail", path: "/rec/s1/thumb.jpg", durationMs: null, width: 320, height: 180, fileSizeBytes: 20000, createdAt: "" },
  { id: "a3", sessionId: "s1", projectId: "p1", type: "screenshot", path: "/rec/s1/ss.png", durationMs: null, width: 1920, height: 1080, fileSizeBytes: 500000, createdAt: "" },
];

beforeEach(() => {
  vi.stubGlobal("portfolio", {
    assets: {
      listBySession: vi.fn().mockResolvedValue(assets),
    },
  });
});

describe("SessionDetail", () => {
  it("renders back button", async () => {
    await act(async () => {
      render(<SessionDetail session={completeSession} project={project} onBack={() => {}} onDelete={() => {}} />);
    });
    expect(screen.getByText(/Back to recordings/)).toBeInTheDocument();
  });

  it("renders project name in heading", async () => {
    await act(async () => {
      render(<SessionDetail session={completeSession} project={project} onBack={() => {}} onDelete={() => {}} />);
    });
    expect(screen.getByText(/My App/)).toBeInTheDocument();
  });

  it("renders Unknown Project when project is undefined", async () => {
    await act(async () => {
      render(<SessionDetail session={completeSession} project={undefined} onBack={() => {}} onDelete={() => {}} />);
    });
    expect(screen.getByText(/Unknown Project/)).toBeInTheDocument();
  });

  it("displays video player for raw_video asset", async () => {
    const { container } = render(<SessionDetail session={completeSession} project={project} onBack={() => {}} onDelete={() => {}} />);
    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });
  });

  it("shows recording in progress message for active session without video", async () => {
    vi.mocked(window.portfolio.assets.listBySession).mockResolvedValue([]);
    render(<SessionDetail session={recordingSession} project={project} onBack={() => {}} onDelete={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Recording in progress/)).toBeInTheDocument();
    });
  });

  it("displays thumbnails", async () => {
    render(<SessionDetail session={completeSession} project={project} onBack={() => {}} onDelete={() => {}} />);
    await waitFor(() => {
      const thumbs = screen.getAllByRole("img");
      expect(thumbs.length).toBe(2);
    });
  });

  it("displays session metadata", async () => {
    render(<SessionDetail session={completeSession} project={project} onBack={() => {}} onDelete={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("manual")).toBeInTheDocument();
      expect(screen.getByText("5:00")).toBeInTheDocument();
      expect(screen.getByText("complete")).toBeInTheDocument();
    });
  });

  it("calls onBack when back button is clicked", async () => {
    let called = false;
    await act(async () => {
      render(<SessionDetail session={completeSession} project={project} onBack={() => { called = true; }} onDelete={() => {}} />);
    });
    await act(async () => {
      screen.getByText(/Back to recordings/).click();
    });
    expect(called).toBe(true);
  });

  it("calls onDelete when delete button is clicked", async () => {
    let deleted: RecordingSession | null = null;
    await act(async () => {
      render(<SessionDetail session={completeSession} project={project} onBack={() => {}} onDelete={(s) => { deleted = s; }} />);
    });
    await act(async () => {
      screen.getByText("Delete").click();
    });
    expect(deleted).toEqual(completeSession);
  });
});
