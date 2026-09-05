CREATE TABLE IF NOT EXISTS feature_evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  description TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'candidate',
  commits TEXT NOT NULL DEFAULT '[]',
  screenshot_paths TEXT NOT NULL DEFAULT '[]',
  recording_segment_paths TEXT NOT NULL DEFAULT '[]',
  readme_snippet TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_feature_evidence_project ON feature_evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_feature_evidence_status ON feature_evidence(status);
