ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN features TEXT;
ALTER TABLE projects ADD COLUMN tech_stack TEXT;
ALTER TABLE projects ADD COLUMN github_url TEXT;
ALTER TABLE projects ADD COLUMN project_status TEXT NOT NULL DEFAULT 'active';
