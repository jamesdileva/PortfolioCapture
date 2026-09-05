import { useState, useEffect } from "react";
import type { Project, RecordingSession, MediaAsset, GitCommit } from "../../../../packages/shared/types/index.js";

interface ProjectTimelineProps {
  project: Project;
  sessions: RecordingSession[];
  onSessionClick: (session: RecordingSession) => void;
}

interface TimelineEvent {
  type: "commit" | "recording" | "screenshot" | "demo";
  timestamp: string;
  dateKey: string;
  label: string;
  description: string | null;
  refId: string | null;
}

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  events: TimelineEvent[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function buildTimelineEvents(
  commits: GitCommit[],
  sessions: RecordingSession[],
  assets: MediaAsset[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const c of commits) {
    events.push({
      type: "commit",
      timestamp: c.date,
      dateKey: dateKey(c.date),
      label: c.message,
      description: c.sha.slice(0, 7),
      refId: c.sha,
    });
  }

  for (const s of sessions) {
    events.push({
      type: "recording",
      timestamp: s.startedAt,
      dateKey: dateKey(s.startedAt),
      label: `Recording ${s.status === "complete" ? "completed" : s.status}`,
      description: s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : null,
      refId: s.id,
    });
  }

  for (const a of assets) {
    if (a.type === "demo_video") {
      events.push({
        type: "demo",
        timestamp: a.createdAt,
        dateKey: dateKey(a.createdAt),
        label: "Demo generated",
        description: a.durationMs ? `${Math.round(a.durationMs / 1000)}s` : null,
        refId: a.sessionId,
      });
    } else if (a.type === "screenshot") {
      events.push({
        type: "screenshot",
        timestamp: a.createdAt,
        dateKey: dateKey(a.createdAt),
        label: "Screenshot captured",
        description: null,
        refId: a.sessionId,
      });
    }
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return events;
}

function groupByDate(events: TimelineEvent[]): DateGroup[] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const key = e.dateKey;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  const groups: DateGroup[] = [];
  for (const [dateKey, evts] of map) {
    groups.push({
      dateKey,
      dateLabel: formatDate(evts[0].timestamp),
      events: evts,
    });
  }

  groups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return groups;
}

function eventIcon(type: TimelineEvent["type"]): string {
  switch (type) {
    case "commit": return "git";
    case "recording": return "rec";
    case "screenshot": return "img";
    case "demo": return "vid";
  }
}

export function ProjectTimeline({ project, sessions, onSessionClick }: ProjectTimelineProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [gitCommits, projectAssets] = await Promise.all([
          window.portfolio.git.log(project.path, 50).catch(() => []),
          window.portfolio.assets.listByProject(project.id).catch(() => []),
        ]);
        if (!cancelled) {
          setCommits(gitCommits);
          setAssets(projectAssets);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [project.path, project.id]);

  const events = buildTimelineEvents(commits, sessions, assets);
  const groups = groupByDate(events);

  if (loading) {
    return <p style={{ color: "#888" }}>Loading timeline...</p>;
  }

  if (events.length === 0) {
    return (
      <div>
        <h3 style={{ margin: "0 0 0.5rem" }}>Timeline</h3>
        <p style={{ color: "#888" }}>No events yet for this project.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 0.75rem" }}>Timeline</h3>
      <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
        <div style={lineStyle} />
        {groups.map((group) => (
          <div key={group.dateKey} style={{ marginBottom: "1.5rem" }}>
            <div style={dateStyle}>{group.dateLabel}</div>
            {group.events.map((event, idx) => (
              <div
                key={`${event.type}-${idx}`}
                style={eventStyle}
                onClick={() => {
                  if (event.type === "recording" && event.refId) {
                    const session = sessions.find((s) => s.id === event.refId);
                    if (session) onSessionClick(session);
                  }
                }}
              >
                <span style={dotStyle(event.type)}>{eventIcon(event.type)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.9em", color: "#ddd" }}>{event.label}</div>
                  {event.description && (
                    <div style={{ fontSize: "0.75em", color: "#888" }}>{event.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const lineStyle: React.CSSProperties = {
  position: "absolute",
  left: "0.45rem",
  top: 0,
  bottom: 0,
  width: "1px",
  background: "#333",
};

const dateStyle: React.CSSProperties = {
  fontSize: "0.8em",
  fontWeight: 600,
  color: "#aaa",
  marginBottom: "0.4rem",
  marginLeft: "0.3rem",
};

const eventStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
  padding: "0.3rem 0",
  cursor: "pointer",
  borderRadius: "4px",
};

function dotStyle(type: TimelineEvent["type"]): React.CSSProperties {
  const colors: Record<TimelineEvent["type"], string> = {
    commit: "#5b9",
    recording: "#e55",
    screenshot: "#59e",
    demo: "#e95",
  };
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.1rem",
    height: "1.1rem",
    borderRadius: "50%",
    fontSize: "0.55em",
    fontWeight: 700,
    color: "#000",
    background: colors[type],
    flexShrink: 0,
    marginTop: "0.15rem",
  };
}
