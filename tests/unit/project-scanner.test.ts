import { describe, it, expect } from "vitest";
import { ProjectScannerImpl } from "../../apps/desktop/electron/services/project-scanner.js";

function createMockReaddir(entries: string[]) {
  return async (_path: string) => entries;
}

function createMockReadFile(files: Record<string, string>) {
  return async (path: string, encoding: BufferEncoding) => {
    const key = path.replace(/\\/g, "/");
    for (const [pattern, content] of Object.entries(files)) {
      if (key.endsWith(pattern)) return content;
    }
    throw new Error(`File not found: ${path}`);
  };
}

describe("ProjectScannerImpl", () => {
  describe("scan", () => {
    it("returns empty structure for empty path", async () => {
      const scanner = new ProjectScannerImpl();
      const result = await scanner.scan("");
      expect(result).toEqual({
        hasFrontend: false,
        hasBackend: false,
        hasDatabase: false,
        hasTests: false,
        hasDocs: false,
        hasAssets: false,
        detectedTech: [],
        topLevelDirs: [],
        configFiles: [],
      });
    });

    it("detects React frontend from package.json deps", async () => {
      const readdir = createMockReaddir(["src", "package.json", "tsconfig.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "my-app",
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
        }),
        "tsconfig.json": "{}",
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(true);
      expect(result.detectedTech).toContain("react");
      expect(result.configFiles).toContain("tsconfig.json");
    });

    it("detects Vue frontend", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ dependencies: { vue: "^3.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(true);
      expect(result.detectedTech).toContain("vue");
    });

    it("detects Angular frontend", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ dependencies: { "@angular/core": "^17.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(true);
      expect(result.detectedTech).toContain("@angular/core");
    });

    it("detects backend from Express dependency", async () => {
      const readdir = createMockReaddir(["server", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasBackend).toBe(true);
      expect(result.detectedTech).toContain("express");
    });

    it("detects backend from server/ directory", async () => {
      const readdir = createMockReaddir(["server", "README.md"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasBackend).toBe(true);
    });

    it("detects backend from api/ directory", async () => {
      const readdir = createMockReaddir(["api", "README.md"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasBackend).toBe(true);
    });

    it("detects database from prisma dependency", async () => {
      const readdir = createMockReaddir(["prisma", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ devDependencies: { prisma: "^5.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasDatabase).toBe(true);
      expect(result.detectedTech).toContain("prisma");
    });

    it("detects database from migrations/ directory", async () => {
      const readdir = createMockReaddir(["migrations", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasDatabase).toBe(true);
    });

    it("detects database from prisma/ directory", async () => {
      const readdir = createMockReaddir(["prisma", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasDatabase).toBe(true);
    });

    it("detects tests from tests/ directory", async () => {
      const readdir = createMockReaddir(["tests", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasTests).toBe(true);
    });

    it("detects tests from __tests__/ directory", async () => {
      const readdir = createMockReaddir(["__tests__", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasTests).toBe(true);
    });

    it("detects tests from vitest dependency", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasTests).toBe(true);
    });

    it("detects docs from docs/ directory", async () => {
      const readdir = createMockReaddir(["docs", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasDocs).toBe(true);
    });

    it("detects docs from .md files in top level", async () => {
      const readdir = createMockReaddir(["README.md", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasDocs).toBe(true);
    });

    it("detects assets from assets/ directory", async () => {
      const readdir = createMockReaddir(["assets", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasAssets).toBe(true);
    });

    it("detects assets from images/ directory", async () => {
      const readdir = createMockReaddir(["images", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasAssets).toBe(true);
    });

    it("detects assets from public/ directory", async () => {
      const readdir = createMockReaddir(["public", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasAssets).toBe(true);
    });

    it("detects assets from static/ directory", async () => {
      const readdir = createMockReaddir(["static", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasAssets).toBe(true);
    });

    it("detects TypeScript from tsconfig.json", async () => {
      const readdir = createMockReaddir(["tsconfig.json", "src"]);
      const readFile = createMockReadFile({ "tsconfig.json": "{}" });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.configFiles).toContain("tsconfig.json");
      expect(result.detectedTech).toContain("TypeScript");
    });

    it("detects Vite from vite.config.ts", async () => {
      const readdir = createMockReaddir(["vite.config.ts", "src"]);
      const readFile = createMockReadFile({ "vite.config.ts": "export default {}" });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.configFiles).toContain("vite.config.ts");
      expect(result.detectedTech).toContain("Vite");
    });

    it("detects Docker from docker-compose.yml", async () => {
      const readdir = createMockReaddir(["docker-compose.yml", "src"]);
      const readFile = createMockReadFile({ "docker-compose.yml": "version: '3'" });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.configFiles).toContain("docker-compose.yml");
      expect(result.detectedTech).toContain("Docker");
    });

    it("detects multiple technologies simultaneously", async () => {
      const readdir = createMockReaddir(["src", "server", "tests", "docs", "package.json", "tsconfig.json", "docker-compose.yml"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          dependencies: { react: "^18.0.0", express: "^4.18.0", prisma: "^5.0.0" },
          devDependencies: { vitest: "^1.0.0" },
        }),
        "tsconfig.json": "{}",
        "docker-compose.yml": "version: '3'",
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(true);
      expect(result.hasBackend).toBe(true);
      expect(result.hasDatabase).toBe(true);
      expect(result.hasTests).toBe(true);
      expect(result.hasDocs).toBe(true);
      expect(result.detectedTech).toContain("react");
      expect(result.detectedTech).toContain("express");
      expect(result.detectedTech).toContain("prisma");
      expect(result.detectedTech).toContain("TypeScript");
      expect(result.detectedTech).toContain("Docker");
    });

    it("handles missing package.json gracefully", async () => {
      const readdir = createMockReaddir(["src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(false);
      expect(result.hasBackend).toBe(false);
      expect(result.hasDatabase).toBe(false);
    });

    it("handles malformed package.json gracefully", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({ "package.json": "{ invalid json" });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(false);
    });

    it("handles unreadable directory gracefully", async () => {
      const readdir = async () => { throw new Error("EACCES"); };
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.topLevelDirs).toEqual([]);
      expect(result.hasFrontend).toBe(false);
    });

    it("filters hidden directories from top-level", async () => {
      const readdir = createMockReaddir([".git", ".vscode", "src", "node_modules"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.topLevelDirs).toEqual(["src", "node_modules"]);
    });

    it("detects NestJS backend", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ dependencies: { "@nestjs/core": "^10.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasBackend).toBe(true);
      expect(result.detectedTech).toContain("@nestjs/core");
    });

    it("detects Svelte frontend", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ dependencies: { svelte: "^4.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasFrontend).toBe(true);
      expect(result.detectedTech).toContain("svelte");
    });

    it("detects MongoDB from mongoose dependency", async () => {
      const readdir = createMockReaddir(["src", "package.json"]);
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ dependencies: { mongoose: "^7.0.0" } }),
      });
      const scanner = new ProjectScannerImpl(readdir, readFile);

      const result = await scanner.scan("/some/project");
      expect(result.hasDatabase).toBe(true);
      expect(result.detectedTech).toContain("mongoose");
    });

    it("returns empty arrays for non-existent project path with readdir error", async () => {
      const readdir = async () => { throw new Error("ENOENT"); };
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/nonexistent");
      expect(result.topLevelDirs).toEqual([]);
      expect(result.configFiles).toEqual([]);
    });

    it("detects test/ directory (singular)", async () => {
      const readdir = createMockReaddir(["test", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasTests).toBe(true);
    });

    it("detects doc/ directory (singular)", async () => {
      const readdir = createMockReaddir(["doc", "src"]);
      const scanner = new ProjectScannerImpl(readdir);

      const result = await scanner.scan("/some/project");
      expect(result.hasDocs).toBe(true);
    });
  });
});
