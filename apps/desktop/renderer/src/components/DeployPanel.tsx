import { useState } from "react";
import type { DeployTarget, ZipExportResult, DeployResult } from "../../../../packages/shared/types/index.js";

interface DeployPanelProps {
  portfolioDir: string;
}

const DEPLOY_LABELS: Record<DeployTarget, string> = {
  zip: "ZIP Export",
  "github-pages": "GitHub Pages",
  netlify: "Netlify",
  vercel: "Vercel",
};

export function DeployPanel({ portfolioDir }: DeployPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<DeployTarget>("zip");
  const [siteName, setSiteName] = useState("");

  const clearFeedback = () => { setError(null); setResult(null); };

  const handleZipExport = async () => {
    clearFeedback();
    setBusy(true);
    try {
      const res: ZipExportResult = await window.portfolio.deploy.zip(portfolioDir);
      setResult(`ZIP created: ${res.fileCount} files, ${(res.fileSizeBytes / 1024).toFixed(1)} KB at ${res.outputPath}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZIP export failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    clearFeedback();
    setBusy(true);
    try {
      await window.portfolio.deploy.preview(portfolioDir);
      setResult("Opened in default browser");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeploy = async () => {
    clearFeedback();
    setBusy(true);
    try {
      const res: DeployResult = await window.portfolio.deploy.run({
        target: selectedTarget,
        portfolioDir,
        siteName: siteName || undefined,
      });
      setResult(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={panelStyle}>
      <h2 style={headingStyle}>Export &amp; Deploy</h2>

      <div style={rowStyle}>
        <button onClick={handleZipExport} disabled={busy} style={btnStyle}>
          Download ZIP
        </button>
        <button onClick={handlePreview} disabled={busy} style={btnStyle}>
          Preview Locally
        </button>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label style={labelStyle}>Deploy Target</label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {(["zip", "github-pages", "netlify", "vercel"] as DeployTarget[]).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTarget(t)}
              style={{
                ...chipStyle,
                background: selectedTarget === t ? "#2563eb" : "#222",
                borderColor: selectedTarget === t ? "#3b82f6" : "#555",
                color: selectedTarget === t ? "#fff" : "#ccc",
              }}
            >
              {DEPLOY_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {(selectedTarget === "github-pages" || selectedTarget === "netlify" || selectedTarget === "vercel") && (
        <div style={{ marginTop: "0.75rem" }}>
          <label style={labelStyle}>Site Name (optional)</label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="my-portfolio.example.com"
            style={inputStyle}
          />
        </div>
      )}

      <button
        onClick={handleDeploy}
        disabled={busy}
        style={{ ...btnStyle, marginTop: "1rem", background: "#1d4ed8", borderColor: "#2563eb" }}
      >
        Deploy: {DEPLOY_LABELS[selectedTarget]}
      </button>

      {error && <p style={errorStyle}>{error}</p>}
      {result && <p style={resultStyle}>{result}</p>}
      {busy && <p style={{ color: "#888", fontSize: "0.85em", marginTop: "0.5rem" }}>Working...</p>}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "1.25rem",
  marginTop: "1rem",
};

const headingStyle: React.CSSProperties = {
  fontSize: "1.1em",
  marginBottom: "0.75rem",
  color: "#eee",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
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

const chipStyle: React.CSSProperties = {
  padding: "0.3rem 0.75rem",
  border: "1px solid #555",
  borderRadius: "12px",
  background: "#222",
  color: "#ccc",
  cursor: "pointer",
  fontSize: "0.85em",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85em",
  color: "#aaa",
  marginBottom: "0.35rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.6rem",
  border: "1px solid #444",
  borderRadius: "4px",
  background: "#111",
  color: "#eee",
  fontSize: "0.9em",
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  color: "#f87171",
  fontSize: "0.85em",
  marginTop: "0.75rem",
};

const resultStyle: React.CSSProperties = {
  color: "#4ade80",
  fontSize: "0.85em",
  marginTop: "0.75rem",
};
