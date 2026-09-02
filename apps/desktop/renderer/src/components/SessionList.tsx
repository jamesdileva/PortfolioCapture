import type { RecordingSession, Project } from "../../../../packages/shared/types/index.js";

interface SessionListProps {
  sessions: RecordingSession[];
  projects: Project[];
  onSessionClick: (session: RecordingSession) => void;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  starting: { bg: "#3b3510", fg: "#facc15" },
  recording: { bg: "#450a0a", fg: "#f87171" },
  paused: { bg: "#1e293b", fg: "#94a3b8" },
  finalizing: { bg: "#3b3510", fg: "#facc15" },
  processing: { bg: "#1e3a5f", fg: "#60a5fa" },
  complete: { bg: "#14532d", fg: "#4ade80" },
  failed: { bg: "#450a0a", fg: "#f87171" },
  cancelled: { bg: "#1e293b", fg: "#94a3b8" },
};

export function SessionList({ sessions, projects, onSessionClick }: SessionListProps) {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Recordings</h2>
        <p style={{ color: "#888" }}>No recordings yet. Start a session to see it here.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Recordings ({sorted.length})</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Project</th>
            <th style={thStyle}>Duration</th>
            <th style={thStyle}>Trigger</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const colors = STATUS_COLORS[s.status] ?? STATUS_COLORS.cancelled;
            return (
              <tr
                key={s.id}
                onClick={() => onSessionClick(s)}
                style={{ borderBottom: "1px solid #222", cursor: "pointer" }}
              >
                <td style={tdStyle}>
                  <div>{formatDate(s.startedAt)}</div>
                  <div style={{ color: "#888", fontSize: "0.8em" }}>{formatTime(s.startedAt)}</div>
                </td>
                <td style={tdStyle}>{projectMap.get(s.projectId) ?? "Unknown"}</td>
                <td style={tdStyle}>{formatDuration(s.durationMs)}</td>
                <td style={{ ...tdStyle, textTransform: "capitalize" }}>{s.trigger}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.8em",
                      fontWeight: 600,
                      background: colors.bg,
                      color: colors.fg,
                    }}
                  >
                    {s.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.5rem",
  fontWeight: 600,
  color: "#ccc",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem",
};
