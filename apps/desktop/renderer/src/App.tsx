import { useState, useEffect, useCallback, useRef } from "react";
import type { Project, RecordingSession, CreateProjectInput, UpdateProjectInput } from "../../../packages/shared/types/index.js";
import { ProjectList } from "./components/ProjectList";
import { ProjectForm } from "./components/ProjectForm";
import { SessionList } from "./components/SessionList";
import { SessionDetail } from "./components/SessionDetail";

type Tab = "projects" | "recordings";
type ProjectView = "list" | "add" | "edit";

export function App() {
  const [tab, setTab] = useState<Tab>("projects");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectView, setProjectView] = useState<ProjectView>("list");
  const [editing, setEditing] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);

  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSession, setSelectedSession] = useState<RecordingSession | null>(null);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<RecordingSession | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const list = await window.portfolio.projects.list();
      setProjects(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const list = await window.portfolio.sessions.list();
      setSessions(list);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadSessions();
  }, [loadProjects, loadSessions]);

  const handleSave = async (input: CreateProjectInput | (UpdateProjectInput & { id: string })) => {
    if ("id" in input) {
      const { id, ...updateData } = input;
      await window.portfolio.projects.update(id, updateData);
    } else {
      await window.portfolio.projects.create(input);
    }
    await loadProjects();
    setProjectView("list");
    setEditing(null);
  };

  const handleEdit = (project: Project) => {
    setEditing(project);
    setProjectView("edit");
  };

  const handleDelete = async (project: Project) => {
    await window.portfolio.projects.delete(project.id);
    setDeleteConfirm(null);
    await loadProjects();
  };

  const handleAdd = () => {
    setEditing(null);
    setProjectView("add");
  };

  const handleCancel = () => {
    setProjectView("list");
    setEditing(null);
  };

  const handleSessionClick = (session: RecordingSession) => {
    setSelectedSession(session);
  };

  const handleDeleteSession = async (session: RecordingSession) => {
    await window.portfolio.sessions.delete(session.id);
    setDeleteSessionConfirm(null);
    setSelectedSession(null);
    await loadSessions();
  };

  const handleBackToList = () => {
    setSelectedSession(null);
    loadSessions();
  };

  const [activeProjectIds, setActiveProjectIds] = useState<Set<string>>(new Set());
  const lastActivityRef = useRef(0);

  useEffect(() => {
    const unsub1 = window.portfolio.on("portfolio:session-started", (data: unknown) => {
      const d = data as { project?: { id: string } };
      if (d?.project?.id) {
        setActiveProjectIds((prev) => new Set(prev).add(d.project!.id));
      }
    });
    const unsub2 = window.portfolio.on("portfolio:session-stopped", (data: unknown) => {
      const d = data as { project?: { id: string } };
      if (d?.project?.id) {
        setActiveProjectIds((prev) => {
          const next = new Set(prev);
          next.delete(d.project!.id);
          return next;
        });
      }
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  useEffect(() => {
    if (activeProjectIds.size === 0) return;

    const THROTTLE_MS = 1000;
    const report = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < THROTTLE_MS) return;
      lastActivityRef.current = now;
      for (const pid of activeProjectIds) {
        window.portfolio.sessions.recordActivity(pid);
      }
    };

    const events = ["mousemove", "mousedown", "keydown", "wheel"] as const;
    for (const event of events) {
      document.addEventListener(event, report, { passive: true });
    }

    return () => {
      for (const event of events) {
        document.removeEventListener(event, report);
      }
    };
  }, [activeProjectIds]);

  const loading = tab === "projects" ? loadingProjects : loadingSessions;

  return (
    <div style={container}>
      <h1 style={{ borderBottom: "1px solid #333", paddingBottom: "0.5rem", fontSize: "1.3em" }}>
        Portfolio Auto Recorder
      </h1>

      <div style={{ display: "flex", gap: "0", marginBottom: "1rem" }}>
        <TabBtn active={tab === "projects"} onClick={() => { setTab("projects"); setSelectedSession(null); }}>Projects</TabBtn>
        <TabBtn active={tab === "recordings"} onClick={() => { setTab("recordings"); setSelectedSession(null); }}>Recordings</TabBtn>
      </div>

      {loading ? (
        <p style={{ color: "#888" }}>Loading...</p>
      ) : tab === "projects" ? (
        <>
          {projectView === "list" && (
            <>
              <ProjectList
                projects={projects}
                onEdit={handleEdit}
                onDelete={(p) => setDeleteConfirm(p)}
                onAdd={handleAdd}
              />
              {deleteConfirm && (
                <div style={overlay}>
                  <div style={modal}>
                    <p>Delete project <strong>{deleteConfirm.name}</strong>?</p>
                    <p style={{ color: "#aaa", fontSize: "0.85em" }}>This cannot be undone.</p>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                      <button onClick={() => handleDelete(deleteConfirm)} style={{ ...btnStyle, borderColor: "#a33", color: "#f88" }}>Delete</button>
                      <button onClick={() => setDeleteConfirm(null)} style={btnStyle}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {(projectView === "add" || projectView === "edit") && (
            <ProjectForm
              project={editing}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          )}
        </>
      ) : (
        <>
          {selectedSession ? (
            <SessionDetail
              session={selectedSession}
              project={projects.find((p) => p.id === selectedSession.projectId)}
              onBack={handleBackToList}
              onDelete={(s) => setDeleteSessionConfirm(s)}
            />
          ) : (
            <SessionList
              sessions={sessions}
              projects={projects}
              onSessionClick={handleSessionClick}
            />
          )}
          {deleteSessionConfirm && (
            <div style={overlay}>
              <div style={modal}>
                <p>Delete this recording?</p>
                <p style={{ color: "#aaa", fontSize: "0.85em" }}>This will remove the session record. Raw files may remain on disk.</p>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                  <button onClick={() => handleDeleteSession(deleteSessionConfirm)} style={{ ...btnStyle, borderColor: "#a33", color: "#f88" }}>Delete</button>
                  <button onClick={() => setDeleteSessionConfirm(null)} style={btnStyle}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.4rem 1rem",
        border: "1px solid #333",
        borderBottom: active ? "1px solid #0a0a0a" : "1px solid #333",
        borderRadius: "6px 6px 0 0",
        background: active ? "#1a1a1a" : "#111",
        color: active ? "#eee" : "#888",
        cursor: "pointer",
        fontSize: "0.9em",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

const container: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "1.5rem 2rem",
  maxWidth: "900px",
  margin: "0 auto",
  color: "#eee",
  background: "#0a0a0a",
  minHeight: "100vh",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modal: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #444",
  borderRadius: "8px",
  padding: "1.5rem",
  minWidth: "300px",
};

const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  border: "1px solid #555",
  borderRadius: "4px",
  background: "#222",
  color: "#ddd",
  cursor: "pointer",
  fontSize: "0.9em",
};
