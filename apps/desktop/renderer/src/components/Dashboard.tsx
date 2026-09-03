import { useState, useEffect } from "react";
import type { Project, RecordingSession, MediaAsset } from "../../../../packages/shared/types/index.js";

interface DashboardProps {
  projects: Project[];
  sessions: RecordingSession[];
  onProjectClick: (project: Project) => void;
  onSessionClick: (session: RecordingSession) => void;
}

interface ProjectStats {
  captureCount: number;
  lastActivity: string | null;
  totalDurationMs: number;
}

interface DashboardData {
  recentDemos: { asset: MediaAsset; projectName: string }[];
  recentScreenshots: { asset: MediaAsset; projectName: string }[];
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function computeProjectStats(sessions: RecordingSession[]): Map<string, ProjectStats> {
  const map = new Map<string, ProjectStats>();
  for (const s of sessions) {
    const existing = map.get(s.projectId) ?? { captureCount: 0, lastActivity: null, totalDurationMs: 0 };
    existing.captureCount++;
    if (s.startedAt > (existing.lastActivity ?? "")) {
      existing.lastActivity = s.startedAt;
    }
    existing.totalDurationMs += s.durationMs ?? 0;
    map.set(s.projectId, existing);
  }
  return map;
}

export function Dashboard({ projects, sessions, onProjectClick, onSessionClick }: DashboardProps) {
  const [data, setData] = useState<DashboardData>({ recentDemos: [], recentScreenshots: [] });
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const allDemos: { asset: MediaAsset; projectName: string }[] = [];
        const allScreenshots: { asset: MediaAsset; projectName: string }[] = [];
        const projectMap = new Map(projects.map((p) => [p.id, p.name]));

        for (const project of projects) {
          try {
            const assets = await window.portfolio.assets.listByProject(project.id);
            for (const a of assets) {
              if (a.type === "demo_video") {
                allDemos.push({ asset: a, projectName: projectMap.get(project.id) ?? "Unknown" });
              } else if (a.type === "screenshot") {
                allScreenshots.push({ asset: a, projectName: projectMap.get(project.id) ?? "Unknown" });
              }
            }
          } catch {
            // skip failed project
          }
        }

        if (!cancelled) {
          setData({
            recentDemos: allDemos.sort((a, b) => new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime()),
            recentScreenshots: allScreenshots.sort((a, b) => new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime()),
          });
        }
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projects]);

  const stats = computeProjectStats(sessions);
  const totalCaptures = sessions.length;
  const activeProjects = projects.filter((p) => stats.has(p.id)).length;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Projects" value={String(projects.length)} />
        <StatCard label="Active" value={String(activeProjects)} />
        <StatCard label="Total Captures" value={String(totalCaptures)} />
      </div>

      <h3 style={{ margin: "0 0 0.5rem" }}>Projects</h3>
      {projects.length === 0 ? (
        <p style={{ color: "#888" }}>No projects yet. Add a project to get started.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {projects.map((p) => {
            const s = stats.get(p.id);
            return (
              <div
                key={p.id}
                onClick={() => onProjectClick(p)}
                style={cardStyle}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{p.name}</div>
                <div style={{ color: "#888", fontSize: "0.85em" }}>
                  {s ? `${s.captureCount} capture${s.captureCount !== 1 ? "s" : ""}` : "No captures"}
                </div>
                <div style={{ color: "#666", fontSize: "0.8em" }}>
                  {s?.lastActivity ? `Last: ${formatDate(s.lastActivity)}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ margin: "0 0 0.5rem" }}>Recent Demos</h3>
      {loadingAssets ? (
        <p style={{ color: "#888" }}>Loading...</p>
      ) : data.recentDemos.length === 0 ? (
        <p style={{ color: "#888" }}>No demos yet.</p>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {data.recentDemos.slice(0, 6).map(({ asset, projectName }) => (
            <div key={asset.id} style={demoCardStyle}>
              <video
                style={{ width: "100%", height: "100px", objectFit: "cover", background: "#000", borderRadius: "4px" }}
                src={`file:///${asset.path}`}
                muted
                preload="metadata"
              />
              <div style={{ fontSize: "0.8em", color: "#ccc", marginTop: "0.25rem" }}>{projectName}</div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ margin: "0 0 0.5rem" }}>Recent Screenshots</h3>
      {loadingAssets ? (
        <p style={{ color: "#888" }}>Loading...</p>
      ) : data.recentScreenshots.length === 0 ? (
        <p style={{ color: "#888" }}>No screenshots yet.</p>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {data.recentScreenshots.slice(0, 10).map(({ asset, projectName }) => (
            <div key={asset.id} style={screenshotCardStyle}>
              <img
                src={`file:///${asset.path}`}
                alt={projectName}
                style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "4px", border: "1px solid #333" }}
              />
              <div style={{ fontSize: "0.8em", color: "#888", marginTop: "0.25rem" }}>{projectName}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#111", border: "1px solid #333", borderRadius: "6px", padding: "0.75rem 1rem" }}>
      <div style={{ fontSize: "1.5em", fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#888", fontSize: "0.85em" }}>{label}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  borderRadius: "6px",
  padding: "0.75rem 1rem",
  cursor: "pointer",
};

const demoCardStyle: React.CSSProperties = {
  width: "180px",
  background: "#111",
  border: "1px solid #333",
  borderRadius: "6px",
  padding: "0.5rem",
};

const screenshotCardStyle: React.CSSProperties = {
  width: "140px",
  background: "#111",
  border: "1px solid #333",
  borderRadius: "6px",
  padding: "0.5rem",
};
