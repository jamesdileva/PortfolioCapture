import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import type {
  PortfolioGenerateConfig,
  PortfolioGenerateResult,
  PortfolioData,
  PortfolioProjectData,
  PortfolioThemeConfig,
  ThemeColorConfig,
} from "../../../../packages/shared/types/index.js";
import { MIN_PORTFOLIO_SESSION_DURATION_MS } from "../../../../packages/shared/types/index.js";
import type { ProjectService } from "./project-service.js";
import type { SessionService } from "./session-service.js";
import type { AssetService } from "./asset-service.js";
import type { ThemeServiceImpl } from "./theme-service.js";

const DEFAULT_OUTPUT_DIR = "data/portfolio";

const BUILTIN_THEME_FALLBACK: PortfolioThemeConfig = {
  name: "developer",
  label: "Developer",
  colors: {
    background: "#0d1117",
    surface: "#161b22",
    text: "#e6edf3",
    textMuted: "#8b949e",
    accent: "#58a6ff",
    border: "#30363d",
    statusActive: "#3fb950",
    statusCompleted: "#58a6ff",
    statusPaused: "#d29922",
  },
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
  borderRadius: "6px",
  gridColumns: "repeat(auto-fill, minmax(340px, 1fr))",
  cardStyle: "bordered",
};

function slugify(name: string): string {
  return name.replace(/[<>:"/\\|?*\s]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateThemeCSS(theme: PortfolioThemeConfig): string {
  const c = theme.colors;
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${theme.fontFamily}; background: ${c.background}; color: ${c.text}; padding: 2rem; }
    h1 { margin-bottom: 0.5rem; }
    .summary { color: ${c.textMuted}; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: ${theme.gridColumns}; gap: 1.5rem; }
    .card { background: ${c.surface}; ${theme.cardStyle === "bordered" ? `border: 1px solid ${c.border};` : theme.cardStyle === "elevated" ? `box-shadow: 0 2px 8px rgba(0,0,0,0.3);` : ""} border-radius: ${theme.borderRadius}; padding: 1.25rem; }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .card h2 a { color: ${c.accent}; text-decoration: none; }
    .card p { color: ${c.textMuted}; font-size: 0.9rem; margin-bottom: 0.75rem; }
    .meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .status { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: ${c.border}; }
    .status.active { color: ${c.statusActive}; }
    .status.completed { color: ${c.statusCompleted}; }
    .status.paused { color: ${c.statusPaused}; }
    .tech { font-size: 0.75rem; color: ${c.textMuted}; }
    .demo { width: 100%; border-radius: ${theme.borderRadius}; margin-bottom: 0.5rem; }
    .screenshots { display: flex; gap: 0.5rem; overflow-x: auto; }
    .screenshots img { height: 100px; border-radius: ${theme.borderRadius}; }
    footer { margin-top: 3rem; color: ${c.textMuted}; font-size: 0.8rem; text-align: center; }
  `;
}

function generateProjectThemeCSS(theme: PortfolioThemeConfig): string {
  const c = theme.colors;
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${theme.fontFamily}; background: ${c.background}; color: ${c.text}; padding: 2rem; max-width: 800px; margin: 0 auto; }
    h1 { margin-bottom: 0.5rem; }
    .back { color: ${c.accent}; text-decoration: none; display: inline-block; margin-bottom: 1.5rem; }
    .hero { margin-bottom: 1.5rem; }
    .hero img { width: 100%; border-radius: ${theme.borderRadius}; }
    section { margin-bottom: 1.5rem; }
    h2 { font-size: 1rem; color: ${c.textMuted}; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
    p, li { line-height: 1.6; }
    ul { padding-left: 1.2rem; }
    .badges { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .badge { background: ${c.border}; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; }
    .demo { width: 100%; border-radius: ${theme.borderRadius}; }
    .screenshots { display: flex; gap: 0.5rem; overflow-x: auto; }
    .screenshots img { height: 120px; border-radius: ${theme.borderRadius}; }
    .timeline { list-style: none; padding-left: 0; }
    .timeline li { display: flex; gap: 0.75rem; align-items: baseline; padding: 0.3rem 0; border-left: 2px solid ${c.border}; padding-left: 1rem; margin-left: 0.5rem; }
    .tl-date { color: ${c.textMuted}; font-size: 0.8rem; min-width: 8rem; }
    .tl-label { color: ${c.text}; }
    .tl-duration { color: ${c.textMuted}; font-size: 0.8rem; margin-left: auto; }
    a { color: ${c.accent}; }
  `;
}

function generateIndexHtml(data: PortfolioData, theme?: PortfolioThemeConfig): string {
  const projectCards = data.projects
    .map(
      (p) => `
      <div class="card">
        <h2><a href="projects/${slugify(p.name)}.html">${escapeHtml(p.name)}</a></h2>
        ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ""}
        <div class="meta">
          <span class="status ${p.projectStatus}">${p.projectStatus}</span>
          ${p.techStack.length > 0 ? `<span class="tech">${escapeHtml(p.techStack.join(", "))}</span>` : ""}
        </div>
        ${p.demoPath ? `<video class="demo" src="assets/${basename(p.demoPath)}" controls muted></video>` : ""}
        ${p.screenshots.length > 0 ? `<div class="screenshots">${p.screenshots.map((s) => `<img src="assets/${basename(s.path)}" alt="screenshot" loading="lazy" />`).join("")}</div>` : ""}
      </div>`,
    )
    .join("\n");

  const css = theme ? generateThemeCSS(theme) : generateThemeCSS(BUILTIN_THEME_FALLBACK);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Portfolio</title>
  <style>
    ${css}
  </style>
</head>
<body>
  <h1>Portfolio</h1>
  <div class="summary">${data.summary.totalProjects} projects &middot; ${data.summary.totalSessions} sessions &middot; ${data.summary.totalScreenshots} screenshots${data.summary.hasDemos ? " &middot; demos" : ""}</div>
  <div class="grid">
${projectCards}
  </div>
  <footer>Generated by Portfolio Auto Recorder on ${data.generatedAt}</footer>
</body>
</html>`;
}

function generateProjectHtml(project: PortfolioProjectData, theme?: PortfolioThemeConfig): string {
  const heroSection =
    project.screenshots.length > 0
      ? `<div class="hero"><img src="../assets/${basename(project.screenshots[0].path)}" alt="hero" /></div>`
      : "";

  const featuresList =
    project.features.length > 0
      ? `<section><h2>Features</h2><ul>${project.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul></section>`
      : "";

  const techBadges =
    project.techStack.length > 0
      ? `<section><h2>Tech Stack</h2><div class="badges">${project.techStack.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")}</div></section>`
      : "";

  const screenshotsSection =
    project.screenshots.length > 0
      ? `<section><h2>Screenshots</h2><div class="screenshots">${project.screenshots.map((s) => `<img src="../assets/${basename(s.path)}" alt="screenshot" loading="lazy" />`).join("")}</div></section>`
      : "";

  const demoSection = project.demoPath
    ? `<section><h2>Demo</h2><video class="demo" src="../assets/${basename(project.demoPath)}" controls muted></video></section>`
    : "";

  const githubSection = project.githubUrl
    ? `<section><h2>GitHub</h2><a href="${escapeHtml(project.githubUrl)}" target="_blank">${escapeHtml(project.githubUrl)}</a></section>`
    : "";

  const timelineSection =
    project.sessions.length > 0
      ? `<section><h2>Timeline</h2><ul class="timeline">${project.sessions
          .map((s) => {
            const date = new Date(s.startedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
            const duration = s.durationMs != null ? formatDuration(s.durationMs) : "in progress";
            return `<li><span class="tl-date">${escapeHtml(date)}</span> <span class="tl-label">Recording</span> <span class="tl-duration">${escapeHtml(duration)}</span></li>`;
          })
          .join("")}</ul></section>`
      : "";

  const css = theme ? generateProjectThemeCSS(theme) : generateProjectThemeCSS(BUILTIN_THEME_FALLBACK);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)} — Portfolio</title>
  <style>
    ${css}
  </style>
</head>
<body>
  <a class="back" href="../index.html">&larr; Back to Portfolio</a>
  <h1>${escapeHtml(project.name)}</h1>
  ${heroSection}
  ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ""}
  ${demoSection}
  ${screenshotsSection}
  ${featuresList}
  ${techBadges}
  ${githubSection}
  ${timelineSection}
</body>
</html>`;
}

export class PortfolioGeneratorImpl {
  private projectService: ProjectService;
  private sessionService: SessionService;
  private assetService: AssetService;
  private themeService: ThemeServiceImpl | null;
  private defaultOutputDir: string;
  private cachedData: PortfolioData | null = null;

  constructor(
    projectService: ProjectService,
    sessionService: SessionService,
    assetService: AssetService,
    defaultOutputDir?: string,
    themeService?: ThemeServiceImpl,
  ) {
    this.projectService = projectService;
    this.sessionService = sessionService;
    this.assetService = assetService;
    this.defaultOutputDir = defaultOutputDir ?? DEFAULT_OUTPUT_DIR;
    this.themeService = themeService ?? null;
  }

  async generate(config?: PortfolioGenerateConfig): Promise<PortfolioGenerateResult> {
    const outputDir = config?.outputDir ?? this.defaultOutputDir;
    const includeScreenshots = config?.includeScreenshots !== false;
    const includeDemos = config?.includeDemos !== false;

    let theme: PortfolioThemeConfig | undefined;
    if (this.themeService) {
      const themeName = config?.theme ?? this.themeService.getActiveThemeName();
      theme = this.themeService.getTheme(themeName);
      if (config?.customColors) {
        theme = { ...theme, colors: { ...theme.colors, ...config.customColors } };
      }
    }

    const projects = this.projectService.list();
    const data = this.buildPortfolioData(projects, includeScreenshots, includeDemos);
    this.cachedData = data;

    const assetsDir = join(outputDir, "assets");
    const projectsDir = join(outputDir, "projects");

    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
    if (!existsSync(projectsDir)) mkdirSync(projectsDir, { recursive: true });

    let assetCount = 0;

    for (const project of data.projects) {
      if (project.demoPath && existsSync(project.demoPath)) {
        copyFileSync(project.demoPath, join(assetsDir, basename(project.demoPath)));
        assetCount++;
      }
      for (const shot of project.screenshots) {
        if (existsSync(shot.path)) {
          copyFileSync(shot.path, join(assetsDir, basename(shot.path)));
          assetCount++;
        }
      }
    }

    writeFileSync(join(outputDir, "data.json"), JSON.stringify(data, null, 2), "utf-8");

    const indexHtml = generateIndexHtml(data, theme);
    writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");

    for (const project of data.projects) {
      const projectHtml = generateProjectHtml(project, theme);
      writeFileSync(join(projectsDir, `${slugify(project.name)}.html`), projectHtml, "utf-8");
    }

    return {
      outputDir,
      projectCount: data.projects.length,
      assetCount,
      indexHtmlPath: join(outputDir, "index.html"),
      dataJsonPath: join(outputDir, "data.json"),
    };
  }

  getData(): PortfolioData {
    if (!this.cachedData) {
      const projects = this.projectService.list();
      this.cachedData = this.buildPortfolioData(projects, true, true);
    }
    return this.cachedData;
  }

  private buildPortfolioData(
    projects: ReturnType<ProjectService["list"]>,
    includeScreenshots: boolean,
    includeDemos: boolean,
  ): PortfolioData {
    const projectData: PortfolioProjectData[] = [];
    let totalSessions = 0;
    let totalScreenshots = 0;
    let hasDemos = false;

    for (const project of projects) {
      const sessions = this.sessionService.listByProject(project.id);
      const completeSessions = sessions.filter(
        (s) =>
          s.status === "complete" &&
          (s.durationMs == null || s.durationMs >= MIN_PORTFOLIO_SESSION_DURATION_MS),
      );

      let demoPath: string | null = null;
      const screenshots: PortfolioProjectData["screenshots"] = [];

      if (includeDemos || includeScreenshots) {
        const assets = this.assetService.listByProject(project.id);

        if (includeDemos) {
          const demoAsset = assets.find((a) => a.type === "demo_video");
          if (demoAsset) {
            demoPath = demoAsset.path;
            hasDemos = true;
          }
        }

        if (includeScreenshots) {
          const shotAssets = assets.filter((a) => a.type === "screenshot");
          for (const shot of shotAssets) {
            screenshots.push({
              id: shot.id,
              path: shot.path,
              width: shot.width,
              height: shot.height,
            });
          }
        }
      }

      totalSessions += completeSessions.length;
      totalScreenshots += screenshots.length;

      projectData.push({
        id: project.id,
        name: project.name,
        description: project.description,
        features: project.features,
        techStack: project.techStack,
        githubUrl: project.githubUrl,
        projectStatus: project.projectStatus,
        sessions: completeSessions.map((s) => ({
          id: s.id,
          startedAt: s.startedAt,
          durationMs: s.durationMs,
          status: s.status,
        })),
        screenshots,
        demoPath,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      projects: projectData,
      summary: {
        totalProjects: projectData.length,
        totalSessions,
        totalScreenshots,
        hasDemos,
      },
    };
  }
}
