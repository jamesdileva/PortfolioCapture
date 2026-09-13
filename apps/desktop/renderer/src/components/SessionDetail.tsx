import { useState, useEffect } from "react";
import type { RecordingSession, Project, MediaAsset, Settings } from "../../../../packages/shared/types/index.js";

interface SessionDetailProps {
  session: RecordingSession;
  project: Project | undefined;
  onBack: () => void;
  onDelete: (session: RecordingSession) => void;
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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toFileUrl(fsPath: string): string {
  return encodeURI("file:///" + fsPath.replace(/\\/g, "/").replace(/^\/+/, ""));
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

export function SessionDetail({ session, project, onBack, onDelete }: SessionDetailProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [fallbackWindow, setFallbackWindow] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.portfolio.assets
      .listBySession(session.id)
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });
    const settingsPromise = ((): Promise<Settings[]> | null | undefined => {
      try {
        return window.portfolio.settings?.get?.() ?? null;
      } catch {
        return null;
      }
    })();
    settingsPromise
      ?.then((list) => {
        if (!cancelled) {
          const note = list.find((s) => s.key === `capture-fallback:${session.id}`);
          if (note) setFallbackWindow(note.value);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  const rawVideoPath = session.rawVideoPath ?? assets.find((a) => a.type === "raw_video")?.path ?? null;
  const thumbnailAssets = assets.filter(
    (a) => a.type === "thumbnail" || a.type === "screenshot"
  );

  const colors = STATUS_COLORS[session.status] ?? STATUS_COLORS.cancelled;

  return (
    <div>
      <button onClick={onBack} style={backBtn}>&larr; Back to recordings</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>
          {project?.name ?? "Unknown Project"} — Session
        </h2>
        <button onClick={() => onDelete(session)} style={{ ...btnStyle, ...deleteBtn }}>Delete</button>
      </div>

      {fallbackWindow && (
        <div style={{ padding: "0.6rem 0.8rem", marginTop: "0.75rem", background: "#3b2f10", border: "1px solid #a80", borderRadius: "4px", color: "#fc6", fontSize: "0.85em" }}>
          The “{fallbackWindow}” window wasn’t open when recording started — full desktop was captured instead.
        </div>
      )}

      {rawVideoPath ? (
        <div style={{ margin: "1rem 0" }}>
          <video
            controls
            style={{ width: "100%", maxHeight: "400px", background: "#000", borderRadius: "4px" }}
            src={toFileUrl(rawVideoPath)}
          >
            Your browser does not support the video element.
          </video>
        </div>
      ) : (
        session.status === "recording" && (
          <div style={{ padding: "2rem", textAlign: "center", background: "#111", borderRadius: "4px", margin: "1rem 0", border: "1px dashed #333" }}>
            <span style={{ color: "#f87171", fontWeight: 600 }}>Recording in progress</span>
            <p style={{ color: "#888", fontSize: "0.85em" }}>Video will be available when recording stops.</p>
          </div>
        )
      )}

      {thumbnailAssets.length > 0 && (
        <div style={{ margin: "1rem 0" }}>
          <h3 style={{ margin: "0 0 0.5rem" }}>Thumbnails</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {thumbnailAssets.map((a) => (
              <img
                key={a.id}
                src={toFileUrl(a.path)}
                alt={a.type}
                style={{ width: "160px", height: "90px", objectFit: "cover", borderRadius: "4px", border: "1px solid #333" }}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 2rem" }}>
        <MetaRow label="Date" value={formatDate(session.startedAt)} />
        <MetaRow label="Status">
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
            {session.status}
          </span>
        </MetaRow>
        <MetaRow label="Duration" value={formatDuration(session.durationMs)} />
        <MetaRow label="Trigger" value={session.trigger} />
        <MetaRow label="Project" value={project?.path ?? "—"} />
        <MetaRow label="Assets" value={loadingAssets ? "Loading..." : String(assets.length)} />
      </div>
    </div>
  );
}

function MetaRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: "0.3rem 0", borderBottom: "1px solid #1a1a1a" }}>
      <span style={{ color: "#888", fontSize: "0.85em" }}>{label}: </span>
      {children ?? <span>{value}</span>}
    </div>
  );
}

const backBtn: React.CSSProperties = {
  padding: "0.3rem 0.6rem",
  border: "none",
  background: "transparent",
  color: "#60a5fa",
  cursor: "pointer",
  fontSize: "0.9em",
};

const btnStyle: React.CSSProperties = {
  padding: "0.4rem 0.8rem",
  border: "1px solid #555",
  borderRadius: "4px",
  background: "#222",
  color: "#ddd",
  cursor: "pointer",
  fontSize: "0.85em",
};

const deleteBtn: React.CSSProperties = {
  borderColor: "#a33",
  color: "#f88",
};
