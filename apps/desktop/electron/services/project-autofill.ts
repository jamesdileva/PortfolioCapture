import type { ProjectAutoFillResult } from "../../../../packages/shared/types/index.js";
import { readFile as defaultReadFile, readdir as defaultReaddir } from "fs/promises";
import { join, basename, dirname, extname } from "path";
import { exec as defaultExec } from "child_process";

type ExecFn = (cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => void;
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
  vitest: "Vitest", jest: "Jest", mocha: "Mocha",
  webpack: "Webpack", vite: "Vite", esbuild: "esbuild", rollup: "Rollup",
  docker: "Docker",
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
};

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

    const [packageJson, readmeContent, gitUrl, exeFiles, configFiles] = await Promise.all([
      this.readPackageJson(dir),
      this.readReadme(dir),
      this.getGitRemoteUrl(dir),
      this.scanForExecutables(dir),
      this.detectConfigFiles(dir),
    ]);

    const name = packageJson?.name ?? basename(dir);
    const description = this.extractReadmeParagraph(readmeContent);
    const launchCommand = this.detectLaunchCommand(packageJson);
    const techStack = this.detectTechStack(packageJson, configFiles);
    const githubUrl = gitUrl;
    const executablePath = exeFiles[0] ?? null;

    return {
      name,
      description,
      launchCommand,
      techStack,
      githubUrl,
      executablePath,
    };
  }

  private resolveDirectory(inputPath: string): string {
    const ext = extname(inputPath).toLowerCase();
    if (EXE_EXTENSIONS.has(ext)) {
      return dirname(inputPath);
    }
    return inputPath;
  }

  private async readPackageJson(dir: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await this.readFileFn(join(dir, "package.json"), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async readReadme(dir: string): Promise<string | null> {
    for (const name of ["README.md", "readme.md", "Readme.md"]) {
      try {
        return await this.readFileFn(join(dir, name), "utf-8");
      } catch {
        continue;
      }
    }
    return null;
  }

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

    return paragraph.length > 0 ? paragraph.join(" ") : null;
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

  private detectTechStack(
    packageJson: Record<string, unknown> | null,
    configFiles: string[],
  ): string[] {
    const tech = new Set<string>();

    if (packageJson) {
      const allDeps: Record<string, string> = {};
      for (const key of ["dependencies", "devDependencies"]) {
        const deps = packageJson[key] as Record<string, string> | undefined;
        if (deps) Object.assign(allDeps, deps);
      }
      for (const dep of Object.keys(allDeps)) {
        const techName = TECH_FROM_DEPS[dep];
        if (techName) tech.add(techName);
      }
    }

    for (const file of configFiles) {
      const techName = TECH_FROM_CONFIG[file];
      if (techName) tech.add(techName);
    }

    return Array.from(tech);
  }

  private async getGitRemoteUrl(dir: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.execFn("git remote get-url origin", (err, stdout) => {
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

  private async scanForExecutables(dir: string): Promise<string[]> {
    try {
      const entries = await this.readdirFn(dir);
      const exes: string[] = [];
      for (const entry of entries) {
        const ext = extname(entry).toLowerCase();
        if (EXE_EXTENSIONS.has(ext)) {
          exes.push(join(dir, entry));
        }
      }
      return exes;
    } catch {
      return [];
    }
  }

  private async detectConfigFiles(dir: string): Promise<string[]> {
    try {
      const entries = await this.readdirFn(dir);
      return entries.filter((e) => e in TECH_FROM_CONFIG);
    } catch {
      return [];
    }
  }
}
