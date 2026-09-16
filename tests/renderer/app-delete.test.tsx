import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "@renderer/App";
import { clearAllToasts } from "@renderer/components/ErrorToast";

const session = {
  id: "s1",
  projectId: "p1",
  startedAt: "2026-09-01T10:30:00Z",
  endedAt: "2026-09-01T10:35:00Z",
  status: "complete",
  trigger: "manual",
  durationMs: 300000,
  rawVideoPath: "/rec/s1/raw.mp4",
};

const mockDelete = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  clearAllToasts();
  // @ts-expect-error mock
  window.portfolio = {
    projects: { list: async () => [] },
    sessions: {
      list: async () => [session],
      delete: mockDelete,
      recordActivity: async () => {},
    },
    assets: { listBySession: async () => [] },
    settings: { get: async () => [] },
    portfolio: { outputDir: async () => "/portfolio" },
    on: () => () => {},
  };
});

describe("App delete error handling", () => {
  it("shows a toast when session delete fails", async () => {
    mockDelete.mockRejectedValue(new Error("FOREIGN KEY constraint failed"));
    render(<App />);

    fireEvent.click(screen.getByText("Recordings"));
    await waitFor(() => {
      expect(screen.getByText("manual")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("manual").closest("tr")!);
    await waitFor(() => {
      expect(screen.getByText(/Back to recordings/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete", { selector: "button" }));
    await waitFor(() => {
      expect(screen.getByText("Delete this recording?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText("Delete")[1]);
    await waitFor(() => {
      expect(screen.getByText(/Failed to delete recording/)).toBeInTheDocument();
    });
  });

  it("closes the modal and refreshes when session delete succeeds", async () => {
    mockDelete.mockResolvedValue(true);
    render(<App />);

    fireEvent.click(screen.getByText("Recordings"));
    await waitFor(() => {
      expect(screen.getByText("manual")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("manual").closest("tr")!);
    await waitFor(() => {
      expect(screen.getByText(/Back to recordings/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete", { selector: "button" }));
    await waitFor(() => {
      expect(screen.getByText("Delete this recording?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText("Delete")[1]);
    await waitFor(() => {
      expect(screen.queryByText("Delete this recording?")).not.toBeInTheDocument();
    });
  });
});
