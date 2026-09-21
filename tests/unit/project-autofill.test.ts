import { describe, it, expect, vi } from "vitest";
import * as path from "path";
import { ProjectAutoFillServiceImpl } from "../../apps/desktop/electron/services/project-autofill.js";

function createMockExec(result: string, error?: Error) {
  return vi.fn((_cmd: string, _opts: { cwd?: string }, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
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

function createMockReaddirMap(map: Record<string, string[]>) {
  return async (dirPath: string) => {
    const normalized = dirPath.replace(/\\/g, "/");
    for (const [key, entries] of Object.entries(map)) {
      if (normalized === key || normalized.endsWith(key)) return entries;
    }
    throw new Error(`ENOENT: ${dirPath}`);
  };
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

    it("passes cwd to git remote command", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddir([]);
      const exec = createMockExec("https://github.com/user/repo.git\n");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      await svc.detect("/projects/my-app");
      expect(exec).toHaveBeenCalledWith(
        "git remote get-url origin",
        { cwd: "/projects/my-app" },
        expect.any(Function),
      );
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

    it("detects python project from pyproject.toml", async () => {
      const readFile = createMockReadFile({
        "pyproject.toml": `[project]\nname = "worldsim"\ndescription = "AI sim"\nkeywords = ["sim", "ai"]\ndependencies = ["fastapi>=0.1", "pytest"]\n`,
        "entry_worldsim.py": "# entry",
      });
      const readdir = createMockReaddirMap({
        "/projects/sim": ["pyproject.toml", "entry_worldsim.py", "README.md"],
      });
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/sim");
      expect(result.name).toBe("worldsim");
      expect(result.description).toBe("AI sim");
      expect(result.launchCommand).toBe("python entry_worldsim.py");
      expect(result.techStack).toContain("Python");
      expect(result.techStack).toContain("FastAPI");
      expect(result.techStack).toContain("pytest");
      expect(result.features).toContain("sim");
      expect(result.features).toContain("ai");
    });

    it("detects python deps from requirements.txt", async () => {
      const readFile = createMockReadFile({
        "requirements.txt": "Flask==3.0.0\nrequests>=2.0  # http\n# a comment\n",
        "app.py": "app = 1",
      });
      const readdir = createMockReaddirMap({
        "/projects/web": ["requirements.txt", "app.py"],
      });
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/web");
      expect(result.techStack).toContain("Python");
      expect(result.techStack).toContain("Flask");
      expect(result.launchCommand).toBe("python app.py");
    });

    it("extracts features from README Features section", async () => {
      const readFile = createMockReadFile({
        "README.md": "# App\n\nDoes things.\n\n## Features\n\n- Fast capture\n- Auto trim\n- **Bold** publishing\n\n## License\n\nMIT.",
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.features).toEqual(["Fast capture", "Auto trim", "Bold publishing"]);
    });

    it("caps features at 8", async () => {
      const bullets = Array.from({ length: 12 }, (_, i) => `- Feature ${i}`).join("\n");
      const readFile = createMockReadFile({
        "README.md": `# App\n\nDesc.\n\n## Features\n\n${bullets}\n`,
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.features).toHaveLength(8);
    });

    it("strips markdown from descriptions", async () => {
      const readFile = createMockReadFile({
        "README.md": "# App\n\nA **bold** tool with [docs](https://example.com) and `code`.\n",
      });
      const readdir = createMockReaddir([]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.description).toBe("A bold tool with docs and code.");
    });

    it("finds executables in dist subdirectories", async () => {
      const readFile = createMockReadFile({});
      const readdir = createMockReaddirMap({
        "/projects/app": ["dist", "src"],
        "/projects/app/dist": ["myapp.exe"],
        "/projects/app/src": ["index.ts"],
      });
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.executablePath).toBe(path.join("/projects/app/dist", "myapp.exe"));
    });

    it("detects dev server ports from vite config and env", async () => {
      const readFile = createMockReadFile({
        "vite.config.ts": "export default { server: { port: 5173 } }",
        ".env": "PORT=3000\nOTHER=x\n",
      });
      const readdir = createMockReaddir(["vite.config.ts", ".env"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.devServerPorts).toEqual(expect.arrayContaining([5173, 3000]));
    });

    it("detects uvicorn-style ports in python entry files", async () => {
      const readFile = createMockReadFile({
        "entry_worldsim.py": "config = uvicorn.Config(app, host=host, port=8600)",
      });
      const readdir = createMockReaddir(["entry_worldsim.py"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/sim");
      expect(result.devServerPorts).toContain(8600);
    });

    it("detects cargo, go, dotnet, and tauri launches", async () => {
      const cases: Array<[Record<string, string>, string[], string | null]> = [
        [{ "Cargo.toml": '[package]\nname = "tool"\n' }, ["Cargo.toml"], "cargo run"],
        [{ "go.mod": "module example.com/tool\n" }, ["go.mod"], "go run ./..."],
        [{ "app.csproj": "<Project></Project>" }, ["app.csproj"], "dotnet run"],
        [
          { "package.json": JSON.stringify({ name: "app", devDependencies: { "@tauri-apps/cli": "^1" } }) },
          ["package.json"],
          "npm run tauri dev",
        ],
      ];
      for (const [files, entries, expected] of cases) {
        const svc = new ProjectAutoFillServiceImpl(
          createMockExec(""),
          createMockReadFile(files),
          createMockReaddir(entries),
        );
        const result = await svc.detect("/projects/app");
        expect(result.launchCommand).toBe(expected);
      }
    });

    it("prefers nested package.json with launch scripts for name and launch", async () => {
      const readFile = createMockReadFile({
        "desktop/package.json": JSON.stringify({ name: "sentinel-desktop", scripts: { start: "electron ." } }),
        "backend/pyproject.toml": '[project]\nname = "sentinel-backend"\n',
      });
      const readdir = createMockReaddirMap({
        "/projects/sentinel": ["desktop", "backend"],
        "/projects/sentinel/desktop": ["package.json"],
        "/projects/sentinel/backend": ["pyproject.toml"],
      });
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/sentinel");
      expect(result.name).toBe("sentinel-desktop");
      expect(result.launchCommand).toBe("npm start");
      expect(result.techStack).toContain("Electron");
      expect(result.techStack).toContain("Python");
    });

    it("handles malformed pyproject gracefully", async () => {
      const readFile = createMockReadFile({
        "pyproject.toml": "[[[not toml",
      });
      const readdir = createMockReaddir(["pyproject.toml"]);
      const exec = createMockExec("");
      const svc = new ProjectAutoFillServiceImpl(exec, readFile, readdir);

      const result = await svc.detect("/projects/app");
      expect(result.name).toBe("app");
      // The file's presence still marks it as Python; only parsed fields degrade.
      expect(result.techStack).toEqual(["Python"]);
    });
  });
});
