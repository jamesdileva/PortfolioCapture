import type { Project } from "../../../../packages/shared/types/index.js";

interface ProjectListProps {
  projects: Project[];
  recordingIds: Set<string>;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onAdd: () => void;
  onRecord: (project: Project) => void;
  onStop: (project: Project) => void;
}

function hasAutoTrigger(p: Project): boolean {
  return Boolean(p.executablePath) || (p.devServerPorts?.length ?? 0) > 0;
}

export function ProjectList({ projects, recordingIds, onEdit, onDelete, onAdd, onRecord, onStop }: ProjectListProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Projects</h2>
        <button onClick={onAdd} style={btnStyle}>Add Project</button>
      </div>
      {projects.length === 0 ? (
        <p style={{ color: "#888" }}>No projects yet. Click "Add Project" to get started.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
              <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Path</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Auto-Record</th>
                <th style={thStyle}>Enabled</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={tdStyle}>{p.name}</td>
                <td style={{ ...tdStyle, color: "#aaa", fontSize: "0.85em" }}>{p.path}</td>
                <td style={tdStyle}>
                  {recordingIds.has(p.id) ? (
                    <span style={{ color: "#f66", fontWeight: 600 }}>● Recording</span>
                  ) : !p.enabled ? (
                    <span style={{ color: "#666" }}>Disabled</span>
                  ) : !hasAutoTrigger(p) ? (
                    <span style={{ color: "#aa6" }} title="No executable path or dev server ports configured — auto-record cannot trigger. Use Record for manual capture.">Manual only</span>
                  ) : (
                    <span style={{ color: "#6b8" }}>Watching</span>
                  )}
                </td>
                <td style={tdStyle}>{p.autoRecord ? "Yes" : "No"}</td>
                <td style={tdStyle}>{p.enabled ? "Yes" : "No"}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                  {recordingIds.has(p.id) ? (
                    <button onClick={() => onStop(p)} style={{ ...btnStyle, ...stopBtn, marginRight: "0.5rem" }}>■ Stop</button>
                  ) : (
                    <button onClick={() => onRecord(p)} disabled={!p.enabled} title={p.enabled ? "Start recording now" : "Enable the project to record"} style={{ ...btnStyle, marginRight: "0.5rem", opacity: p.enabled ? 1 : 0.4 }}>● Record</button>
                  )}
                  <button onClick={() => onEdit(p)} style={{ ...btnStyle, marginRight: "0.5rem" }}>Edit</button>
                  <button onClick={() => onDelete(p)} style={{ ...btnStyle, ...deleteBtn }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

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

const stopBtn: React.CSSProperties = {
  borderColor: "#a33",
  color: "#f88",
};

const thStyle: React.CSSProperties = {
  padding: "0.5rem",
  fontWeight: 600,
  color: "#ccc",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem",
};
