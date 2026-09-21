import type { ProjectAutoFillResult } from "../../../../packages/shared/types/index.js";
import { readFile as defaultReadFile, readdir as defaultReaddir } from "fs/promises";
import { join, basename, dirname, extname } from "path";
import { exec as defaultExec } from "child_process";

type ExecFn = (cmd: string, opts: { cwd?: string }, cb: (err: Error | null, stdout: string, stderr: string) => void) => void;
type ReadFileFn = (path: string, encoding: BufferEncoding) => Promise<string>;
type ReaddirFn = (path: string) => Promise<string[]>;

const EXE_EXTENSIONS = new Set([".exe", ".bat", ".cmd", ".msi"]);

const TECH_FROM_DEPS: Record<string, string> = {
  react: "React", "react-dom": "React",
  vue: "Vue",
  "@angular/core": "Angular", svelte: "Svelte",
  next: "Next.js", nuxt: "Nuxt",
  express: "Express", fastify: "Fastify", koa: "Koa",
  "@nestjs/core": "NestJS", hono: "Hono",
  prisma: "Prisma", "@prisma/client": "Prisma",
  sequelize: "Sequelize", typeorm: "TypeORM", knex: "Knex",
  "better-sqlite3": "SQLite", mongoose: "Mongoose",
  typescript: "TypeScript", tsx: "TypeScript",
  electron: "Electron", tauri: "Tauri",
  tailwindcss: "Tailwind CSS", "styled-components": "styled-components",
  vitest: "Vitest", jest: "Jest", mocha: "Mocha", playwright: "Playwright",
  webpack: "Webpack", vite: "Vite", esbuild: "esbuild", rollup: "Rollup",
  docker: "Docker",
  fastapi: "FastAPI", flask: "Flask", django: "Django", uvicorn: "Uvicorn",
  sqlalchemy: "SQLAlchemy", pydantic: "Pydantic", pytest: "pytest",
  streamlit: "Streamlit", pywebview: "pywebview", pygame: "Pygame",
  torch: "PyTorch", numpy: "NumPy", pandas: "pandas", matplotlib: "Matplotlib",
  scipy: "SciPy", gymnasium: "Gymnasium", "stable-baselines3": "Stable-Baselines3",
  tokio: "Tokio", serde: "serde", gin: "Gin",
};

const TECH_FROM_CONFIG: Record<string, string> = {
  "tsconfig.json": "TypeScript",
  "vite.config.ts": "Vite", "vite.config.js": "Vite",
  "webpack.config.js": "Webpack", "webpack.config.ts": "Webpack",
  "tailwind.config.js": "Tailwind CSS", "tailwind.config.ts": "Tailwind CSS",
  "docker-compose.yml": "Docker", "docker-compose.yaml": "Docker",
  "Dockerfile": "Docker",
  ".eslintrc.js": "ESLint", ".eslintrc.json": "ESLint", "eslint.config.js": "ESLint",
  "prettier.config.js": "Prettier", ".prettierrc": "Prettier",
  "svelte.config.js": "Svelte", "svelte.config.ts": "Svelte",
  "next.config.js": "Next.js", "next.config.mjs": "Next.js",
  "nuxt.config.ts": "Nuxt", "nuxt.config.js": "Nuxt",
  "angular.json": "Angular",
  "pyproject.toml": "Python", "requirements.txt": "Python",
  "Cargo.toml": "Rust",
  "go.mod": "Go",
  "tauri.conf.json": "Tauri",
  "playwright.config.ts": "Playwright",
  "CMakeLists.txt": "CMake",
};

const TECH_FROM_SCRIPT_BINARY: Record<string, string> = {
  electron: "Electron",
  tauri: "Tauri",
  vite: "Vite",
  next: "Next.js",
  expo: "Expo",
  "react-scripts": "React",
  jest: "Jest",
  vitest: "Vitest",
  playwright: "Playwright",
  tsc: "TypeScript",
  node: "Node.js",
  tsx: "TypeScript",
  cargo: "Rust",
  nodemon: "Node.js",
};

const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv", ".tox",
  ".idea", ".vscode", "target",
]);

const KNOWN_EXE_DIRS = new Set([
  "dist", "release", "out", "build", "win-unpacked", "bin",
]);

const PYTHON_ENTRY_CANDIDATES = [
  "entry_*.py",
  "main.py",
  "app.py",
  "run.py",
  "serve.py",
];

const MAX_SCAN_DEPTH = 3;
const MAX_PORTS = 4;

const GENERIC_DIR_NAMES = new Set([
  "backend", "frontend", "src", "server", "client",
  "dist", "build", "out",
]);

interface ManifestHit {
  kind: "package.json" | "pyproject.toml" | "requirements" | "Cargo.toml" | "go.mod" | "csproj" | "sln";
  dir: string;
  name: string;
  depth: number;
}

export class ProjectAutoFillServiceImpl {
  private execFn: ExecFn;
  private readFileFn: ReadFileFn;
  private readdirFn: ReaddirFn;

  constructor(
    execFn?: ExecFn,
    readFileFn?: ReadFileFn,
    readdirFn?: ReaddirFn,
  ) {
    this.execFn = execFn ?? defaultExec;
    this.readFileFn = readFileFn ?? defaultReadFile;
    this.readdirFn = readdirFn ?? defaultReaddir;
  }

  async detect(projectPath: string): Promise<ProjectAutoFillResult> {
    const dir = this.resolveDirectory(projectPath);

    const { manifests, exes, configFiles, pythonFiles } = await this.discover(dir);
    const [packageJson, readmeContent, gitUrl] = await Promise.all([
      this.readPrimaryPackageJson(dir, manifests),
      this.readReadme(dir),
      this.getGitRemoteUrl(dir),
    ]);

    const pyproject = await this.readPyproject(manifests);
    const requirementDeps = await this.readRequirementDeps(manifests);
    const cargo = await this.readCargo(manifests);
    const scriptTech = await this.collectScriptTech(manifests);

    const name =
      packageJson?.data?.name ??
      pyproject?.name ??
      cargo?.name ??
      (await this.readGoModuleAsync(manifests)) ??
      this.directoryDisplayName(dir);
    const description =
      this.extractReadmeParagraph(readmeContent) ??
      pyproject?.description ??
      cargo?.description ??
      (typeof packageJson?.data?.description === "string" ? packageJson.data.description : null);
    const launchCommand =
      this.detectLaunchCommand(packageJson?.data ?? null) ??
      (await this.detectPythonLaunch(dir)) ??
      this.detectCargoLaunch(manifests) ??
      (await this.detectGoLaunch(dir, manifests)) ??
      this.detectDotnetLaunch(manifests) ??
      this.detectTauriLaunch(packageJson?.data ?? null);
    const techStack = this.detectTechStack(packageJson?.data ?? null, configFiles, pyproject, requirementDeps, cargo, scriptTech);
    const frameworkTech = await this.detectPythonFrameworkImports(pythonFiles);
    for (const tech of frameworkTech) {
      if (!techStack.includes(tech)) techStack.push(tech);
    }
    const features = [
      ...this.extractReadmeFeatures(readmeContent),
      ...this.extractKeywords(packageJson?.data ?? null, pyproject),
    ].slice(0, 8);
    const devServerPorts = await this.detectDevServerPorts(dir, pythonFiles);
    const githubUrl = gitUrl;
    const executablePath = this.pickExecutable(exes);

    return {
      name,
      description,
      launchCommand,
      techStack,
      githubUrl,
      executablePath,
      features,
      devServerPorts,
    };
  }

  private resolveDirectory(inputPath: string): string {
    const ext = extname(inputPath).toLowerCase();
    if (EXE_EXTENSIONS.has(ext)) {
      return dirname(inputPath);
    }
    return inputPath;
  }

  private directoryDisplayName(dir: string): string {
    const base = basename(dir);
    if (GENERIC_DIR_NAMES.has(base.toLowerCase())) {
      const parent = basename(dirname(dir));
      if (parent && parent !== "." && parent !== "/" && parent !== "\\") return parent;
    }
    return base;
  }

  // ─── Discovery ────────────────────────────────────────────────

  private async discover(dir: string): Promise<{
    manifests: ManifestHit[];
    exes: string[];
    configFiles: string[];
    pythonFiles: string[];
  }> {
    const manifests: ManifestHit[] = [];
    const exes: string[] = [];
    const configFiles: string[] = [];
    const pythonFiles: string[] = [];
    const visited = new Set<string>();

    const walk = async (current: string, depth: number): Promise<void> => {
      if (depth > MAX_SCAN_DEPTH || visited.has(current)) return;
      visited.add(current);
      let entries: string[];
      try {
        entries = await this.readdirFn(current);
      } catch {
        return;
      }
      const subdirs: string[] = [];
      for (const entry of entries) {
        const full = join(current, entry);
        const lower = entry.toLowerCase();
        if (this.isManifestName(lower)) {
          manifests.push({ kind: this.manifestKind(lower), dir: current, name: entry, depth });
        }
        if (EXE_EXTENSIONS.has(extname(entry).toLowerCase())) {
          exes.push(full);
        }
        if (entry in TECH_FROM_CONFIG && !configFiles.includes(entry)) {
          configFiles.push(entry);
        }
        if (lower.endsWith(".py") && depth <= 2 && pythonFiles.length < 20) {
          pythonFiles.push(full);
        }
        if (depth < MAX_SCAN_DEPTH && !SKIP_DIRS.has(entry) && !SKIP_DIRS.has(lower)) {
          if (KNOWN_EXE_DIRS.has(lower) || !entry.includes(".")) {
            subdirs.push(full);
          }
        }
      }
      for (const sub of subdirs) {
        await walk(sub, depth + 1);
      }
    };

    await walk(dir, 0);
    return { manifests, exes, configFiles, pythonFiles };
  }

  private isManifestName(lower: string): boolean {
    return (
      lower === "package.json" ||
      lower === "pyproject.toml" ||
      lower === "cargo.toml" ||
      lower === "go.mod" ||
      (lower.startsWith("requirements") && lower.endsWith(".txt")) ||
      lower.endsWith(".csproj") ||
      lower.endsWith(".sln")
    );
  }

  private manifestKind(lower: string): ManifestHit["kind"] {
    if (lower === "package.json") return "package.json";
    if (lower === "pyproject.toml") return "pyproject.toml";
    if (lower === "cargo.toml") return "Cargo.toml";
    if (lower === "go.mod") return "go.mod";
    if (lower.endsWith(".sln")) return "sln";
    if (lower.endsWith(".csproj")) return "csproj";
    return "requirements";
  }

  // ─── Readers ──────────────────────────────────────────────────

  private async readFileOrNull(filePath: string): Promise<string | null> {
    try {
      return await this.readFileFn(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  private async readdirOrNull(dir: string): Promise<string[] | null> {
    try {
      return await this.readdirFn(dir);
    } catch {
      return null;
    }
  }

  private async readPrimaryPackageJson(
    dir: string,
    manifests: ManifestHit[],
  ): Promise<{ data: Record<string, unknown>; dir: string } | null> {
    const candidates = manifests
      .filter((m) => m.kind === "package.json")
      .sort((a, b) => a.depth - b.depth);
    // Prefer the shallowest manifest that can actually launch something.
    for (const candidate of candidates) {
      const raw = await this.readFileOrNull(join(candidate.dir, candidate.name));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const scripts = data.scripts as Record<string, string> | undefined;
        if (scripts && (scripts.start || scripts.dev)) {
          return { data, dir: candidate.dir };
        }
      } catch {
        continue;
      }
    }
    for (const candidate of candidates) {
      const raw = await this.readFileOrNull(join(candidate.dir, candidate.name));
      if (!raw) continue;
      try {
        return { data: JSON.parse(raw) as Record<string, unknown>, dir: candidate.dir };
      } catch {
        continue;
      }
    }
    // Fallback: probe the root directly so a root package.json is never
    // missed when directory listings are unavailable or filtered.
    const raw = await this.readFileOrNull(join(dir, "package.json"));
    if (raw) {
      try {
        return { data: JSON.parse(raw) as Record<string, unknown>, dir };
      } catch {
        return null;
      }
    }
    return null;
  }

  private async readReadme(dir: string): Promise<string | null> {
    for (const name of ["README.md", "readme.md", "Readme.md"]) {
      const content = await this.readFileOrNull(join(dir, name));
      if (content) return content;
    }
    return null;
  }

  private parseTomlSection(content: string, section: string): Record<string, string> {
    // Minimal best-effort TOML reader: flat key/value pairs inside one
    // [section]. Enough for [project] and [dependencies]-style blocks.
    const result: Record<string, string> = {};
    const lines = content.split("\n");
    let inside = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("[") && line.endsWith("]")) {
        inside = line.slice(1, -1).trim() === section;
        continue;
      }
      if (!inside || !line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  }

  private parseTomlStringArray(raw: string | undefined): string[] {
    if (!raw) return [];
    const out: string[] = [];
    for (const match of raw.matchAll(/"([^"]+)"/g)) {
      out.push(match[1]);
    }
    return out;
  }

  private async readPyproject(
    manifests: ManifestHit[],
  ): Promise<{ name?: string; description?: string; keywords: string[]; deps: string[] } | null> {
    const hit = manifests.filter((m) => m.kind === "pyproject.toml").sort((a, b) => a.depth - b.depth)[0];
    if (!hit) return null;
    const raw = await this.readFileOrNull(join(hit.dir, hit.name));
    if (!raw) return null;
    try {
      const project = this.parseTomlSection(raw, "project");
      const deps = this.parseTomlStringArray(project.dependencies).map((d) =>
        d.split(/[><=~!;\s[]/)[0].trim().toLowerCase(),
      );
      return {
        name: project.name,
        description: project.description,
        keywords: this.parseTomlStringArray(project.keywords),
        deps,
      };
    } catch {
      return null;
    }
  }

  private async readRequirementDeps(manifests: ManifestHit[]): Promise<string[]> {
    const deps: string[] = [];
    for (const hit of manifests.filter((m) => m.kind === "requirements")) {
      const raw = await this.readFileOrNull(join(hit.dir, hit.name));
      if (!raw) continue;
      for (const line of raw.split("\n")) {
        const cleaned = line.trim();
        if (!cleaned || cleaned.startsWith("#") || cleaned.startsWith("-")) continue;
        deps.push(cleaned.split(/[><=~!;\s\[]/)[0].trim().toLowerCase());
      }
    }
    return deps;
  }

  private async readCargo(
    manifests: ManifestHit[],
  ): Promise<{ name?: string; description?: string; keywords: string[] } | null> {
    const hit = manifests.filter((m) => m.kind === "Cargo.toml").sort((a, b) => a.depth - b.depth)[0];
    if (!hit) return null;
    const raw = await this.readFileOrNull(join(hit.dir, hit.name));
    if (!raw) return null;
    try {
      const pkg = this.parseTomlSection(raw, "package");
      return {
        name: pkg.name,
        description: pkg.description,
        keywords: this.parseTomlStringArray(pkg.keywords),
      };
    } catch {
      return null;
    }
  }

  private async readGoModuleAsync(manifests: ManifestHit[]): Promise<string | null> {
    const hit = manifests.filter((m) => m.kind === "go.mod").sort((a, b) => a.depth - b.depth)[0];
    if (!hit) return null;
    const raw = await this.readFileOrNull(join(hit.dir, hit.name));
    if (!raw) return null;
    const match = raw.match(/^module\s+(\S+)/m);
    if (!match) return null;
    const parts = match[1].split("/");
    return parts[parts.length - 1] || null;
  }

  // ─── Field detection ──────────────────────────────────────────

  private extractReadmeParagraph(content: string | null): string | null {
    if (!content) return null;
    const lines = content.split("\n");
    const paragraph: string[] = [];
    let foundFirst = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (foundFirst && paragraph.length > 0) break;
        continue;
      }
      if (trimmed.startsWith("#")) {
        if (foundFirst && paragraph.length > 0) break;
        continue;
      }
      foundFirst = true;
      paragraph.push(trimmed);
    }

    if (paragraph.length === 0) return null;
    return this.stripMarkdown(paragraph.join(" "));
  }

  private stripMarkdown(text: string): string {
    return text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(`{1,3})([^`]*)\1/g, "$2")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(^|\s)(\*|_)(.*?)\2(?=\s|$)/g, "$1$3")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s?/, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  private extractReadmeFeatures(content: string | null): string[] {
    if (!content) return [];
    const lines = content.split("\n");
    const features: string[] = [];
    let inSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const heading = trimmed.replace(/^#{1,6}\s*/, "").toLowerCase();
      if (/^#{1,6}\s/.test(trimmed)) {
        inSection = /feature|what it does|highlights/.test(heading);
        continue;
      }
      if (!inSection) continue;
      if (!trimmed) {
        if (features.length > 0) break;
        continue;
      }
      const bullet = trimmed.match(/^[-*+]\s+(.*)$/) ?? trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (bullet) {
        const cleaned = this.stripMarkdown(bullet[1]);
        if (cleaned) features.push(cleaned);
        if (features.length >= 8) break;
      } else if (features.length > 0) {
        break;
      }
    }

    return features;
  }

  private extractKeywords(
    packageJson: Record<string, unknown> | null,
    pyproject: { keywords: string[] } | null,
  ): string[] {
    const out: string[] = [];
    const raw = packageJson?.keywords;
    if (Array.isArray(raw)) {
      for (const k of raw) {
        if (typeof k === "string" && k.trim()) out.push(k.trim());
      }
    }
    if (pyproject) out.push(...pyproject.keywords);
    return out.slice(0, 8);
  }

  private detectLaunchCommand(packageJson: Record<string, unknown> | null): string | null {
    if (!packageJson) return null;
    const scripts = packageJson.scripts as Record<string, string> | undefined;
    if (!scripts) return null;

    if (scripts.start) return "npm start";
    if (scripts.dev) return "npm run dev";
    if (scripts.serve) return "npm run serve";
    if (scripts.build && scripts.preview) return "npm run preview";
    return null;
  }

  private detectTauriLaunch(packageJson: Record<string, unknown> | null): string | null {
    if (!packageJson) return null;
    const allDeps = this.collectDeps(packageJson);
    if (allDeps.has("@tauri-apps/cli") || allDeps.has("@tauri-apps/api")) {
      return "npm run tauri dev";
    }
    return null;
  }

  private collectDeps(packageJson: Record<string, unknown>): Set<string> {
    const deps = new Set<string>();
    for (const key of ["dependencies", "devDependencies"]) {
      const group = packageJson[key] as Record<string, string> | undefined;
      if (group) {
        for (const name of Object.keys(group)) deps.add(name);
      }
    }
    return deps;
  }

  private async detectPythonLaunch(dir: string): Promise<string | null> {
    for (const pattern of PYTHON_ENTRY_CANDIDATES) {
      if (pattern.includes("*")) {
        const prefix = pattern.split("*")[0];
        let entries: string[];
        try {
          entries = await this.readdirFn(dir);
        } catch {
          return null;
        }
        const match = entries
          .filter((e) => e.startsWith(prefix) && e.endsWith(".py"))
          .sort()[0];
        if (match) return `python ${match}`;
        const srcEntries = await this.readdirOrNull(join(dir, "src"));
        if (srcEntries) {
          const srcMatch = srcEntries
            .filter((e) => e.startsWith(prefix) && e.endsWith(".py"))
            .sort()[0];
          if (srcMatch) return `python src/${srcMatch}`;
        }
        continue;
      }
      if (await this.readFileOrNull(join(dir, pattern))) return `python ${pattern}`;
      if (await this.readFileOrNull(join(dir, "src", pattern))) return `python src/${pattern}`;
    }
    return null;
  }

  private detectCargoLaunch(manifests: ManifestHit[]): string | null {
    if (manifests.some((m) => m.kind === "Cargo.toml")) return "cargo run";
    return null;
  }

  private async detectGoLaunch(dir: string, manifests: ManifestHit[]): Promise<string | null> {
    if (!manifests.some((m) => m.kind === "go.mod")) return null;
    if (await this.readFileOrNull(join(dir, "main.go"))) return "go run .";
    return "go run ./...";
  }

  private detectDotnetLaunch(manifests: ManifestHit[]): string | null {
    if (manifests.some((m) => m.kind === "csproj" || m.kind === "sln")) return "dotnet run";
    return null;
  }

  private async collectScriptTech(manifests: ManifestHit[]): Promise<string[]> {
    // Tooling revealed by script commands ("electron .", "vite", ...) even
    // when the package is not a declared dependency.
    const tech = new Set<string>();
    for (const hit of manifests.filter((m) => m.kind === "package.json")) {
      const raw = await this.readFileOrNull(join(hit.dir, hit.name));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const scripts = data.scripts as Record<string, string> | undefined;
        if (!scripts) continue;
        for (const cmd of Object.values(scripts)) {
          if (typeof cmd !== "string") continue;
          const binary = cmd.trim().split(/\s+/)[0]?.toLowerCase();
          const name = binary ? TECH_FROM_SCRIPT_BINARY[binary] : undefined;
          if (name) tech.add(name);
        }
      } catch {
        continue;
      }
    }
    return Array.from(tech);
  }

  private detectTechStack(
    packageJson: Record<string, unknown> | null,
    configFiles: string[],
    pyproject: { deps: string[] } | null,
    requirementDeps: string[],
    cargo: unknown,
    scriptTech: string[] = [],
  ): string[] {
    const tech = new Set<string>();

    if (packageJson) {
      for (const dep of this.collectDeps(packageJson)) {
        const techName = TECH_FROM_DEPS[dep];
        if (techName) tech.add(techName);
      }
    }

    const pythonDeps = [...(pyproject?.deps ?? []), ...requirementDeps];
    for (const dep of pythonDeps) {
      const techName = TECH_FROM_DEPS[dep];
      if (techName) tech.add(techName);
    }
    if (pythonDeps.length > 0 || configFiles.includes("pyproject.toml")) {
      tech.add("Python");
    }
    if (cargo) tech.add("Rust");

    for (const file of configFiles) {
      const techName = TECH_FROM_CONFIG[file];
      if (techName) tech.add(techName);
    }

    for (const name of scriptTech) {
      tech.add(name);
    }

    if (configFiles.includes("CMakeLists.txt")) {
      tech.add("C++");
    }

    return Array.from(tech);
  }

  private async detectDevServerPorts(dir: string, pythonFiles: string[] = []): Promise<number[]> {
    const ports = new Set<number>();
    const addPorts = (text: string | null, pattern: RegExp) => {
      if (!text) return;
      for (const match of text.matchAll(pattern)) {
        const port = parseInt(match[1], 10);
        if (port >= 1024 && port <= 65535) ports.add(port);
        if (ports.size >= MAX_PORTS) return;
      }
    };

    for (const name of ["vite.config.ts", "vite.config.js"]) {
      const content = await this.readFileOrNull(join(dir, name));
      addPorts(content, /port\s*:\s*(\d{4,5})/g);
      if (ports.size >= MAX_PORTS) return Array.from(ports);
    }

    const envContent = await this.readFileOrNull(join(dir, ".env"));
    addPorts(envContent, /^PORT\s*=\s*(\d{4,5})/gm);

    const seen = new Set<string>();
    for (const file of pythonFiles) {
      const key = file.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const content = await this.readFileOrNull(file);
      // Plain (port=8600) and annotated (port: int = 8600) assignments.
      addPorts(content, /\bport\s*=\s*(\d{4,5})/g);
      addPorts(content, /\bport\s*:\s*[A-Za-z_]\w*\s*=\s*(\d{4,5})/g);
      if (ports.size >= MAX_PORTS) break;
    }

    return Array.from(ports).slice(0, MAX_PORTS);
  }

  private async detectPythonFrameworkImports(pythonFiles: string[]): Promise<string[]> {
    const patterns: Array<[RegExp, string]> = [
      [/\bfrom\s+flask\b|\bimport\s+flask\b/, "Flask"],
      [/\bfrom\s+fastapi\b|\bimport\s+fastapi\b/, "FastAPI"],
      [/\bfrom\s+django\b|\bimport\s+django\b/, "Django"],
      [/\bimport\s+streamlit\b/, "Streamlit"],
      [/\bimport\s+uvicorn\b|\bfrom\s+uvicorn\b/, "Uvicorn"],
      [/\bimport\s+pywebview\b|\bimport\s+webview\b/, "pywebview"],
      [/\bimport\s+pygame\b/, "Pygame"],
      [/\bimport\s+torch\b/, "PyTorch"],
    ];
    const found = new Set<string>();
    const seen = new Set<string>();
    for (const file of pythonFiles) {
      const key = file.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const content = await this.readFileOrNull(file);
      if (!content) continue;
      for (const [pattern, tech] of patterns) {
        if (pattern.test(content)) found.add(tech);
      }
    }
    return Array.from(found);
  }

  private pickExecutable(exes: string[]): string | null {
    if (exes.length === 0) return null;
    const dirRank = (p: string): number => {
      const parts = p.replace(/\\/g, "/").toLowerCase().split("/");
      const dirs = parts.slice(0, -1);
      let rank = 4;
      for (const d of dirs) {
        if (d === "dist" || d === "release" || d === "win-unpacked" || d === "out") rank = Math.min(rank, 0);
        else if (d === "build" || d === "bin") rank = Math.min(rank, 3);
      }
      return rank;
    };
    const rank = (p: string): number => {
      const base = basename(p).toLowerCase();
      const installerPenalty =
        base.includes("setup") || base.includes("install") || base.includes("uninstall") || base.includes("update") ? 100 : 0;
      const ext = extname(p).toLowerCase();
      const depth = p.split(/[/\\]/).length;
      const extRank = ext === ".exe" ? 0 : 1;
      return installerPenalty + dirRank(p) * 10 + depth + extRank;
    };
    return [...exes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
  }

  private async getGitRemoteUrl(dir: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.execFn("git remote get-url origin", { cwd: dir }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const url = stdout.trim();
        resolve(url || null);
      });
    }).then((url) => {
      if (!url) return null;
      if (!url.startsWith("https://") && url.includes("github.com")) {
        return `https://${url.replace(/.*github\.com[:/]/, "github.com/").replace(/\.git$/, "")}`;
      }
      if (url.startsWith("https://github.com")) {
        return url.replace(/\.git$/, "");
      }
      return url;
    });
  }
}
