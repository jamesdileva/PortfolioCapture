import { describe, it, expect, vi } from "vitest";
import * as path from "path";
import { ProjectAutoFillServiceImpl } from "../../apps/desktop/electron/services/project-autofill.js";

function createMockExec(result: string, error?: Error) {
  return vi.fn((_cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    cb(error ?? null, result, "");
  });
}

function createMockReadFile(files: Record<string, string>) {
  return async (filePath: string, _encoding: BufferEncoding) => {
    const normalized = filePath.replace(/\\/g, "/");
    for (const [pattern, content] of Object.entries(files)) {
      if (normalized.endsWith(pattern)) return content;
    }
    throw new Error(`ENOENT: ${filePath}`);
  };
}

function createMockReaddir(entries: string[]) {
  return async (_path: string) => entries;
}

describe("ProjectAutoFillServiceImpl", () => {
  describe("detect", () => {
    it("returns null fields for nonexistent path", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/nonexistent/path");
      expect(result.name).toBe("path");
      expect(result.description).toBeNull();
      expect(result.launchCommand).toBeNull();
      expect(result.techStack).toEqual([]);
      expect(result.githubUrl).toBeNull();
      expect(result.executablePath).toBeNull();
    });

    it("detects name from directory name", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/my-cool-app");
      expect(result.name).toBe("my-cool-app");
    });

    it("detects name from package.json", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ name: "awesome-app" }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/my-app");
      expect(result.name).toBe("awesome-app");
    });

    it("detects description from README.md first paragraph", async () => {
      const readFile = createMockReadFile({
        "README.md": "# My App\n\nThis is a cool portfolio tool.\n\nIt does many things.",
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/my-app");
      expect(result.description).toBe("This is a cool portfolio tool.");
    });

    it("detects launch command from scripts.start", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "app",
          scripts: { start: "node server.js", build: "tsc" },
        }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.launchCommand).toBe("npm start");
    });

    it("falls back to scripts.dev when no start", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "app",
          scripts: { dev: "vite", build: "tsc" },
        }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.launchCommand).toBe("npm run dev");
    });

    it("falls back to scripts.serve when no start or dev", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "app",
          scripts: { serve: "http-server" },
        }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.launchCommand).toBe("npm run serve");
    });

    it("returns null launchCommand when no scripts", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ name: "app" }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.launchCommand).toBeNull();
    });

    it("detects GitHub URL from git remote", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir([]);
      const exec = createMockExec("git@github.com:user/repo.git\n");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.githubUrl).toBe("https://github.com/user/repo");
    });

    it("normalizes https git URL", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir([]);
      const exec = createMockExec("https://github.com/user/repo.git\n");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.githubUrl).toBe("https://github.com/user/repo");
    });

    it("returns null githubUrl when not a git repo", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir([]);
      const exec = createMockExec("", new Error("not a git repo"));
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.githubUrl).toBeNull();
    });

    it("detects tech stack from package.json deps", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "app",
          dependencies: { react: "^18.0.0", express: "^4.0.0" },
          devDependencies: { typescript: "^5.0.0", vitest: "^1.0.0" },
        }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.techStack).toContain("React");
      expect(result.techStack).toContain("Express");
      expect(result.techStack).toContain("TypeScript");
      expect(result.techStack).toContain("Vitest");
    });

    it("detects TypeScript from tsconfig.json", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir(["tsconfig.json"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.techStack).toContain("TypeScript");
    });

    it("detects Vite from vite.config.ts", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir(["vite.config.ts"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.techStack).toContain("Vite");
    });

    it("resolves executable path from directory scan", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir(["app.exe", "README.md", "src"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.executablePath).toBe(path.join("/projects/app", "app.exe"));
    });

    it("derives parent directory from executable path input", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ name: "detected-name" }),
      });
      const readdir = createMockReaddir(["app.exe"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app/dist/app.exe");
      expect(result.name).toBe("detected-name");
      expect(result.executablePath).toBe(path.join("/projects/app/dist", "app.exe"));
    });

    it("handles malformed package.json gracefully", async () => {
      const readFile = createMockReadFile({
        "package.json": "not json {{{",
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.name).toBe("app");
      expect(result.launchCommand).toBeNull();
      expect(result.techStack).toEqual([]);
    });

    it("handles missing README.md gracefully", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir(["package.json"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.description).toBeNull();
    });

    it("detects build+preview as launch command fallback", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "app",
          scripts: { build: "tsc && vite build", preview: "vite preview" },
        }),
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.launchCommand).toBe("npm run preview");
    });
  });
});
