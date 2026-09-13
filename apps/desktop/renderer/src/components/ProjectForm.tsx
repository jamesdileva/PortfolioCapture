import { useState, useEffect } from "react";
import type { Project, ProjectStatus, CaptureMode, WindowInfo, CreateProjectInput, UpdateProjectInput } from "../../../../packages/shared/types/index.js";

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
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");
  const [techStack, setTechStack] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [devServerPorts, setDevServerPorts] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("desktop");
  const [windowTitle, setWindowTitle] = useState("");
  const [liveWindows, setLiveWindows] = useState<WindowInfo[]>([]);
  const [loadingWindows, setLoadingWindows] = useState(false);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setPath(project.path);
      setExecutablePath(project.executablePath ?? "");
      setLaunchCommand(project.launchCommand ?? "");
      setAutoRecord(project.autoRecord);
      setEnabled(project.enabled);
      setDescription(project.description ?? "");
      setFeatures(project.features.join(", "));
      setTechStack(project.techStack.join(", "));
      setGithubUrl(project.githubUrl ?? "");
      setDevServerPorts(project.devServerPorts?.join(", ") ?? "");
      setCaptureMode(project.captureMode ?? "desktop");
      setWindowTitle(project.windowTitle ?? "");
      setProjectStatus(project.projectStatus);
    }
  }, [project]);

  const refreshWindows = async () => {
    setLoadingWindows(true);
    setWindowsError(null);
    try {
      const list = await window.portfolio.windows.list();
      setLiveWindows(list);
      if (list.length === 0) setWindowsError("No open windows found");
    } catch {
      setWindowsError("Could not list windows");
    } finally {
      setLoadingWindows(false);
    }
  };

  const detectFromPath = async () => {
    const currentPath = path.trim();
    if (!currentPath) return;
    setAutoFilling(true);
    setDetectStatus(null);
    try {
      const result = await window.portfolio.scanner.autofill(currentPath);
      let filled = 0;
      if (!name.trim() && result.name) { setName(result.name); filled++; }
      if (!description.trim() && result.description) { setDescription(result.description); filled++; }
      if (!launchCommand.trim() && result.launchCommand) { setLaunchCommand(result.launchCommand); filled++; }
      if (!techStack.trim() && result.techStack.length > 0) { setTechStack(result.techStack.join(", ")); filled++; }
      if (!githubUrl.trim() && result.githubUrl) { setGithubUrl(result.githubUrl); filled++; }
      if (!executablePath.trim() && result.executablePath) { setExecutablePath(result.executablePath); filled++; }
      setDetectStatus(filled > 0 ? `Auto-filled ${filled} field${filled > 1 ? "s" : ""}` : "No new fields to fill");
      setTimeout(() => setDetectStatus(null), 3000);
    } catch {
      setDetectStatus(null);
    } finally {
      setAutoFilling(false);
    }
  };

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
      const parseList = (raw: string): string[] =>
        raw.split(",").map((s) => s.trim()).filter(Boolean);

      const parsePorts = (raw: string): number[] =>
        raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);

      if (project) {
        const input: UpdateProjectInput & { id: string } = {
          id: project.id,
          name: name.trim(),
          path: path.trim(),
          executablePath: executablePath.trim() || null,
          launchCommand: launchCommand.trim() || null,
          autoRecord,
          enabled,
          description: description.trim() || null,
          features: parseList(features),
          techStack: parseList(techStack),
          githubUrl: githubUrl.trim() || null,
          devServerPorts: parsePorts(devServerPorts),
          captureMode,
          windowTitle: windowTitle.trim() || null,
          projectStatus,
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
          description: description.trim() || undefined,
          features: parseList(features),
          techStack: parseList(techStack),
          githubUrl: githubUrl.trim() || undefined,
          devServerPorts: parsePorts(devServerPorts),
          captureMode,
          windowTitle: windowTitle.trim() || undefined,
          projectStatus,
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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input value={path} onChange={(e) => setPath(e.target.value)} onBlur={detectFromPath} style={{ ...inputStyle, flex: 1 }} placeholder="C:\Projects\my-app" />
          <button type="button" onClick={detectFromPath} disabled={autoFilling || !path.trim()} style={{ ...btnStyle, alignSelf: "flex-start", marginTop: "0.25rem", whiteSpace: "nowrap" }}>
            {autoFilling ? "Detecting..." : "Detect"}
          </button>
        </div>
        {detectStatus && <span style={{ fontSize: "0.8em", color: "#6b8", marginTop: "0.2rem", display: "block" }}>{detectStatus}</span>}
      </label>

      <fieldset style={{ border: "1px solid #444", borderRadius: "6px", padding: "0.75rem", marginBottom: "1rem" }}>
        <legend style={{ color: "#eee", fontSize: "0.9em", padding: "0 0.4rem" }}>What triggers auto-recording</legend>
        <p style={{ color: "#888", fontSize: "0.8em", margin: "0 0 0.75rem" }}>
          Fill in at least one so the app can detect activity automatically. Process launch watches for the
          executable; dev-server detection polls the ports. With neither, use the ● Record button in the project list.
        </p>

        <label style={labelStyle}>
          Executable Path <span style={{ color: "#888" }}>(records when this app launches)</span>
          <input value={executablePath} onChange={(e) => setExecutablePath(e.target.value)} style={inputStyle} placeholder="C:\Projects\my-app\app.exe" />
        </label>

        <label style={{ ...labelStyle, marginBottom: 0 }}>
          Dev Server Ports (comma-separated) <span style={{ color: "#888" }}>(records while a server answers)</span>
          <input value={devServerPorts} onChange={(e) => setDevServerPorts(e.target.value)} style={inputStyle} placeholder="3000, 5173, 8080" />
        </label>
      </fieldset>

      <fieldset style={{ border: "1px solid #444", borderRadius: "6px", padding: "0.75rem", marginBottom: "1rem" }}>
        <legend style={{ color: "#eee", fontSize: "0.9em", padding: "0 0.4rem" }}>Capture area</legend>
        <p style={{ color: "#888", fontSize: "0.8em", margin: "0 0 0.75rem" }}>
          Full desktop captures everything on screen. App window captures just that window — it must be
          open (not minimized) while recording, and overlapping popups can bleed through.
        </p>

        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
            <input type="radio" name="captureMode" checked={captureMode === "desktop"} onChange={() => setCaptureMode("desktop")} />
            Full desktop
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
            <input type="radio" name="captureMode" checked={captureMode === "window"} onChange={() => setCaptureMode("window")} />
            App window
          </label>
        </div>

        {captureMode === "window" && (
          <>
            <label style={labelStyle}>
              Window
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select
                  value={liveWindows.some((w) => w.title === windowTitle) ? windowTitle : ""}
                  onChange={(e) => setWindowTitle(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">Pick an open window…</option>
                  {liveWindows.map((w) => (
                    <option key={`${w.pid}-${w.title}`} value={w.title}>{w.title}</option>
                  ))}
                </select>
                <button type="button" onClick={refreshWindows} disabled={loadingWindows} style={{ ...btnStyle, alignSelf: "flex-start", marginTop: "0.25rem", whiteSpace: "nowrap" }}>
                  {loadingWindows ? "Listing…" : "Refresh"}
                </button>
              </div>
              {windowsError && <span style={{ fontSize: "0.8em", color: "#f88", marginTop: "0.2rem", display: "block" }}>{windowsError}</span>}
            </label>

            <label style={labelStyle}>
              Window title (exact)
              <input value={windowTitle} onChange={(e) => setWindowTitle(e.target.value)} style={inputStyle} placeholder="My App — Dashboard" />
            </label>
            <p style={{ color: "#888", fontSize: "0.8em", margin: "0 0 0.75rem" }}>
              If the window isn't open when recording starts, you'll be told and the full desktop is captured instead.
            </p>
          </>
        )}
      </fieldset>

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

      <label style={labelStyle}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} placeholder="What does this project do?" />
      </label>

      <label style={labelStyle}>
        Features (comma-separated)
        <input value={features} onChange={(e) => setFeatures(e.target.value)} style={inputStyle} placeholder="auth, dashboard, API" />
      </label>

      <label style={labelStyle}>
        Tech Stack (comma-separated)
        <input value={techStack} onChange={(e) => setTechStack(e.target.value)} style={inputStyle} placeholder="React, TypeScript, Node.js" />
      </label>

      <label style={labelStyle}>
        GitHub URL
        <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} style={inputStyle} placeholder="https://github.com/user/repo" />
      </label>

      <label style={labelStyle}>
        Status
        <select value={projectStatus} onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)} style={inputStyle}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
          <option value="completed">Completed</option>
        </select>
      </label>

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
