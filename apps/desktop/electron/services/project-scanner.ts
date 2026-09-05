import type { ProjectStructure } from "../../../../packages/shared/types/index.js";
import { readdir as defaultReaddir, readFile as defaultReadFile } from "fs/promises";
import { join } from "path";

type ReaddirFn = (path: string) => Promise<string[]>;
type ReadFileFn = (path: string, encoding: BufferEncoding) => Promise<string>;

const FRONTEND_DEPS = [
  "react", "vue", "@angular/core", "svelte", "next", "nuxt",
  "@remix-run/react", "solid-js", "preact",
];

const BACKEND_DEPS = [
  "express", "fastify", "koa", "@nestjs/core", "@hapi/hapi",
  "hono", "elysia", "adonisjs", "@adonisjs/core",
];

const DATABASE_DEPS = [
  "sequelize", "typeorm", "knex", "prisma", "@prisma/client",
  "drizzle-orm", "mongoose", "sqlite3", "better-sqlite3",
  "pg", "mysql2", "mongodb",
];

const TEST_CONFIGS = new Set([
  "jest.config", "jest.config.js", "jest.config.ts", "jest.config.mjs",
  "vitest.config", "vitest.config.js", "vitest.config.ts", "vitest.config.mjs",
  ".mocharc", ".mocharc.yml", ".mocharc.js", ".mocharc.cjs",
  "karma.conf.js",
]);

const CONFIG_FILE_LABELS: Record<string, string> = {
  "tsconfig.json": "TypeScript",
  "tsconfig.app.json": "TypeScript",
  "vite.config.ts": "Vite",
  "vite.config.js": "Vite",
  "webpack.config.js": "Webpack",
  "webpack.config.ts": "Webpack",
  "next.config.js": "Next.js",
  "next.config.mjs": "Next.js",
  "nuxt.config.ts": "Nuxt",
  "nuxt.config.js": "Nuxt",
  "svelte.config.js": "Svelte",
  "angular.json": "Angular",
  ".eslintrc.js": "ESLint",
  ".eslintrc.json": "ESLint",
  "eslint.config.js": "ESLint",
  "prettier.config.js": "Prettier",
  ".prettierrc": "Prettier",
  "tailwind.config.js": "Tailwind CSS",
  "tailwind.config.ts": "Tailwind CSS",
  "prisma/schema.prisma": "Prisma",
  "drizzle.config.ts": "Drizzle",
  "docker-compose.yml": "Docker",
  "docker-compose.yaml": "Docker",
  "Dockerfile": "Docker",
};

export class ProjectScannerImpl {
  private readdirFn: ReaddirFn;
  private readFileFn: ReadFileFn;

  constructor(readdirFn?: ReaddirFn, readFileFn?: ReadFileFn) {
    this.readdirFn = readdirFn ?? ((p) => defaultReaddir(p, { withFileTypes: false }) as unknown as Promise<string[]>);
    this.readFileFn = readFileFn ?? defaultReadFile;
  }

  async scan(projectPath: string): Promise<ProjectStructure> {
    if (!projectPath) {
      return this.emptyStructure();
    }

    const [topLevelResult, pkgResult, configResult] = await Promise.allSettled([
      this.readdirFn(projectPath),
      this.readPackageJson(projectPath),
      this.detectConfigFiles(projectPath),
    ]);

    const topLevelDirs = topLevelResult.status === "fulfilled"
      ? topLevelResult.value.filter((e) => !e.startsWith("."))
      : [];

    const pkg = pkgResult.status === "fulfilled" ? pkgResult.value : null;
    const allDeps = pkg ? this.extractDeps(pkg.raw) : [];
    const configFiles = configResult.status === "fulfilled" ? configResult.value : [];

    const hasFrontend = this.detectFrontend(allDeps);
    const hasBackend = this.detectBackend(allDeps, topLevelDirs);
    const hasDatabase = this.detectDatabase(allDeps, topLevelDirs);
    const hasTests = await this.detectTests(topLevelDirs) || this.hasTestFiles(allDeps) || this.hasTestConfigs(topLevelDirs);
    const hasDocs = this.detectDocs(topLevelDirs) || this.hasMdFiles(topLevelDirs);
    const hasAssets = this.detectAssets(topLevelDirs);
    const detectedTech = this.detectTech(allDeps, configFiles);

    return {
      hasFrontend,
      hasBackend,
      hasDatabase,
      hasTests,
      hasDocs,
      hasAssets,
      detectedTech,
      topLevelDirs,
      configFiles,
    };
  }

  private emptyStructure(): ProjectStructure {
    return {
      hasFrontend: false,
      hasBackend: false,
      hasDatabase: false,
      hasTests: false,
      hasDocs: false,
      hasAssets: false,
      detectedTech: [],
      topLevelDirs: [],
      configFiles: [],
    };
  }

  private async readPackageJson(projectPath: string): Promise<{ name: string | null; raw: Record<string, unknown> } | null> {
    try {
      const content = await this.readFileFn(join(projectPath, "package.json"), "utf-8");
      const raw = JSON.parse(content) as Record<string, unknown>;
      return {
        name: typeof raw.name === "string" ? raw.name : null,
        raw,
      };
    } catch {
      return null;
    }
  }

  private extractDeps(pkg: Record<string, unknown>): string[] {
    const deps: string[] = [];
    for (const key of ["dependencies", "devDependencies"]) {
      const obj = pkg[key];
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        deps.push(...Object.keys(obj as Record<string, unknown>));
      }
    }
    return deps;
  }

  private detectFrontend(deps: string[]): boolean {
    return deps.some((d) => FRONTEND_DEPS.includes(d));
  }

  private detectBackend(deps: string[], dirs: string[]): boolean {
    if (deps.some((d) => BACKEND_DEPS.includes(d))) return true;
    if (dirs.includes("server") || dirs.includes("api")) return true;
    return false;
  }

  private detectDatabase(deps: string[], dirs: string[]): boolean {
    if (deps.some((d) => DATABASE_DEPS.includes(d))) return true;
    if (dirs.includes("migrations") || dirs.includes("prisma") || dirs.includes("drizzle")) return true;
    return false;
  }

  private async detectTests(dirs: string[]): Promise<boolean> {
    return dirs.includes("tests") || dirs.includes("__tests__") || dirs.includes("test");
  }

  private hasTestFiles(deps: string[]): boolean {
    return deps.some((d) => ["vitest", "jest", "mocha", "jasmine", "chai"].includes(d));
  }

  private hasTestConfigs(dirs: string[]): boolean {
    return dirs.some((d) => TEST_CONFIGS.has(d));
  }

  private detectDocs(dirs: string[]): boolean {
    return dirs.includes("docs") || dirs.includes("doc");
  }

  private hasMdFiles(dirs: string[]): boolean {
    return dirs.some((d) => d.endsWith(".md"));
  }

  private detectAssets(dirs: string[]): boolean {
    return dirs.includes("assets") || dirs.includes("images") || dirs.includes("public") || dirs.includes("static");
  }

  private detectTech(deps: string[], configFiles: string[]): string[] {
    const tech = new Set<string>();

    for (const dep of deps) {
      if (FRONTEND_DEPS.includes(dep)) tech.add(dep);
      if (BACKEND_DEPS.includes(dep)) tech.add(dep);
      if (DATABASE_DEPS.includes(dep)) tech.add(dep);
    }

    for (const cf of configFiles) {
      const label = CONFIG_FILE_LABELS[cf];
      if (label) tech.add(label);
    }

    return Array.from(tech).sort();
  }

  private async detectConfigFiles(projectPath: string): Promise<string[]> {
    const found: string[] = [];
    for (const pattern of Object.keys(CONFIG_FILE_LABELS)) {
      try {
        await this.readFileFn(join(projectPath, pattern), "utf-8");
        found.push(pattern);
      } catch {
        // file doesn't exist
      }
    }
    return found;
  }
}
