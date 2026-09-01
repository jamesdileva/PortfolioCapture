import { useState, useEffect } from "react";
import type { Project, CreateProjectInput, UpdateProjectInput } from "../../../../packages/shared/types/index.js";

interface ProjectFormProps {
  project: Project | null;
  onSave: (input: CreateProjectInput | (UpdateProjectInput & { id: string })) => Promise<void>;
  onCancel: () => void;
}

export function ProjectForm({ project, onSave, onCancel }: ProjectFormProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [launchCommand, setLaunchCommand] = useState("");
  const [autoRecord, setAutoRecord] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setPath(project.path);
      setExecutablePath(project.executablePath ?? "");
      setLaunchCommand(project.launchCommand ?? "");
      setAutoRecord(project.autoRecord);
      setEnabled(project.enabled);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!path.trim()) {
      setError("Project path is required");
      return;
    }

    setSaving(true);
    try {
      if (project) {
        const input: UpdateProjectInput & { id: string } = {
          id: project.id,
          name: name.trim(),
          path: path.trim(),
          executablePath: executablePath.trim() || null,
          launchCommand: launchCommand.trim() || null,
          autoRecord,
          enabled,
        };
        await onSave(input);
      } else {
        const input: CreateProjectInput = {
          name: name.trim(),
          path: path.trim(),
          executablePath: executablePath.trim() || undefined,
          launchCommand: launchCommand.trim() || undefined,
          autoRecord,
          enabled,
        };
        await onSave(input);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "500px" }}>
      <h2 style={{ marginTop: 0 }}>{project ? "Edit Project" : "Add Project"}</h2>

      {error && (
        <div style={{ padding: "0.5rem", marginBottom: "1rem", background: "#400", border: "1px solid #a33", borderRadius: "4px", color: "#f88" }}>
          {error}
        </div>
      )}

      <label style={labelStyle}>
        Name *
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Project Path *
        <input value={path} onChange={(e) => setPath(e.target.value)} style={inputStyle} placeholder="C:\Projects\my-app" />
      </label>

      <label style={labelStyle}>
        Executable Path
        <input value={executablePath} onChange={(e) => setExecutablePath(e.target.value)} style={inputStyle} placeholder="C:\Projects\my-app\app.exe" />
      </label>

      <label style={labelStyle}>
        Launch Command
        <input value={launchCommand} onChange={(e) => setLaunchCommand(e.target.value)} style={inputStyle} placeholder="npm start" />
      </label>

      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
          <input type="checkbox" checked={autoRecord} onChange={(e) => setAutoRecord(e.target.checked)} />
          Auto-record
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={saving} style={{ ...btnStyle, ...primaryBtn }}>
          {saving ? "Saving..." : project ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onCancel} style={btnStyle} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.75rem",
  color: "#ccc",
  fontSize: "0.9em",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.4rem",
  marginTop: "0.25rem",
  border: "1px solid #555",
  borderRadius: "4px",
  background: "#111",
  color: "#eee",
  fontSize: "0.9em",
  boxSizing: "border-box",
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

const primaryBtn: React.CSSProperties = {
  background: "#2563eb",
  borderColor: "#3b82f6",
  color: "#fff",
};
