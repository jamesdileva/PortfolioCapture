import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import type { RecordingSession, Project } from "../../../packages/shared/types/index.js";
import { SessionList } from "@renderer/components/SessionList";

const projects: Project[] = [
  { id: "p1", name: "My App", path: "/code/app", executablePath: null, launchCommand: null, enabled: true, autoRecord: true, createdAt: "", updatedAt: "" },
  { id: "p2", name: "Other", path: "/code/other", executablePath: null, launchCommand: null, enabled: true, autoRecord: false, createdAt: "", updatedAt: "" },
];

const sessions: RecordingSession[] = [
  { id: "s1", projectId: "p1", startedAt: "2026-09-01T10:30:00Z", endedAt: "2026-09-01T10:35:00Z", status: "complete", trigger: "manual", durationMs: 300000, rawVideoPath: "/rec/s1/raw.mp4" },
  { id: "s2", projectId: "p2", startedAt: "2026-09-01T12:00:00Z", endedAt: null, status: "recording", trigger: "process_launch", durationMs: null, rawVideoPath: null },
  { id: "s3", projectId: "p1", startedAt: "2026-08-31T09:00:00Z", endedAt: "2026-08-31T09:02:00Z", status: "failed", trigger: "manual", durationMs: 120000, rawVideoPath: null },
];

describe("SessionList", () => {
  it("renders empty state when no sessions", () => {
    render(<SessionList sessions={[]} projects={projects} onSessionClick={() => {}} />);
    expect(screen.getByText(/No recordings yet/)).toBeInTheDocument();
  });

  it("renders session count heading", () => {
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={() => {}} />);
    expect(screen.getByText("Recordings (3)")).toBeInTheDocument();
  });

  it("renders rows sorted by date (newest first)", () => {
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={() => {}} />);
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(4);
  });

  it("displays project names", () => {
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={() => {}} />);
    expect(screen.getAllByText("My App").length).toBe(2);
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("displays formatted duration", () => {
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={() => {}} />);
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("displays null duration as dash", () => {
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={() => {}} />);
    const dashes = screen.getAllByText("\u2014");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("displays status badges", () => {
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={() => {}} />);
    expect(screen.getByText("complete")).toBeInTheDocument();
    expect(screen.getByText("recording")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("calls onSessionClick when row is clicked", () => {
    let clicked: RecordingSession | null = null;
    render(<SessionList sessions={sessions} projects={projects} onSessionClick={(s) => { clicked = s; }} />);
    const rows = screen.getAllByRole("row");
    rows[1].click();
    expect(clicked).not.toBeNull();
    expect(clicked!.id).toBe("s2");
  });

  it("shows Unknown for missing project", () => {
    const sessionsWithBadProject = [
      { ...sessions[0], projectId: "nonexistent" },
    ];
    render(<SessionList sessions={sessionsWithBadProject} projects={projects} onSessionClick={() => {}} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
