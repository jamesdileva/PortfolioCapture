import { useState, useEffect, useCallback } from "react";
import type { Project, CreateProjectInput, UpdateProjectInput } from "../../../packages/shared/types/index.js";
import { ProjectList } from "./components/ProjectList";
import { ProjectForm } from "./components/ProjectForm";

type View = "list" | "add" | "edit";

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const list = await window.portfolio.projects.list();
      setProjects(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleSave = async (input: CreateProjectInput | (UpdateProjectInput & { id: string })) => {
    if ("id" in input) {
      const { id, ...updateData } = input;
      await window.portfolio.projects.update(id, updateData);
    } else {
      await window.portfolio.projects.create(input);
    }
    await loadProjects();
    setView("list");
    setEditing(null);
  };

  const handleEdit = (project: Project) => {
    setEditing(project);
    setView("edit");
  };

  const handleDelete = async (project: Project) => {
    await window.portfolio.projects.delete(project.id);
    setDeleteConfirm(null);
    await loadProjects();
  };

  const handleAdd = () => {
    setEditing(null);
    setView("add");
  };

  const handleCancel = () => {
    setView("list");
    setEditing(null);
  };

  if (loading) {
    return (
      <div style={container}>
        <p style={{ color: "#888" }}>Loading projects...</p>
      </div>
    );
  }

  return (
    <div style={container}>
      <h1 style={{ borderBottom: "1px solid #333", paddingBottom: "0.5rem", fontSize: "1.3em" }}>
        Portfolio Auto Recorder
      </h1>

      {view === "list" && (
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

      {(view === "add" || view === "edit") && (
        <ProjectForm
          project={editing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
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
