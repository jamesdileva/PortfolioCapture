import type { Project } from "../../../../packages/shared/types/index.js";

interface ProjectListProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onAdd: () => void;
}

export function ProjectList({ projects, onEdit, onDelete, onAdd }: ProjectListProps) {
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
                <td style={tdStyle}>{p.autoRecord ? "Yes" : "No"}</td>
                <td style={tdStyle}>{p.enabled ? "Yes" : "No"}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
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

const thStyle: React.CSSProperties = {
  padding: "0.5rem",
  fontWeight: 600,
  color: "#ccc",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem",
};
