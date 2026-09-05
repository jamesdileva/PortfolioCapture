import { describe, it, expect } from "vitest";
import { GitServiceImpl } from "../../apps/desktop/electron/services/git-service.js";

function createMockExec(results: Record<string, { stdout: string; stderr: string } | Error>) {
  return async (cmd: string, opts: { cwd: string }) => {
    for (const [pattern, result] of Object.entries(results)) {
      if (cmd.includes(pattern)) {
        if (result instanceof Error) throw result;
        return result;
      }
    }
    throw new Error(`Unexpected command: ${cmd}`);
  };
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

describe("GitServiceImpl", () => {
  describe("getRepoInfo", () => {
    it("returns null for empty project path", async () => {
      const service = new GitServiceImpl();
      expect(await service.getRepoInfo("")).toBeNull();
    });

    it("extracts branch, SHA, commit message, and remote URL", async () => {
      const exec = createMockExec({
        "rev-parse --abbrev-ref HEAD": { stdout: "main\n", stderr: "" },
        "git log -1": { stdout: "abc123\nfeat: add feature\n", stderr: "" },
        "remote get-url": { stdout: "git@github.com:user/repo.git\n", stderr: "" },
      });
      const service = new GitServiceImpl(exec);

      const result = await service.getRepoInfo("/some/project");
      expect(result).toEqual({
        branch: "main",
        sha: "abc123",
        commitMessage: "feat: add feature",
        remoteUrl: "git@github.com:user/repo.git",
      });
    });

    it("returns null when no git repo exists", async () => {
      const exec = async () => { throw new Error("not a git repo"); };
      const service = new GitServiceImpl(exec);
      expect(await service.getRepoInfo("/some/project")).toBeNull();
    });

    it("handles partial git info (branch but no remote)", async () => {
      const exec = createMockExec({
        "rev-parse --abbrev-ref HEAD": { stdout: "develop\n", stderr: "" },
        "git log -1": { stdout: "def456\nfix: bug\n", stderr: "" },
        "remote get-url": new Error("no remote"),
      });
      const service = new GitServiceImpl(exec);

      const result = await service.getRepoInfo("/some/project");
      expect(result).toEqual({
        branch: "develop",
        sha: "def456",
        commitMessage: "fix: bug",
        remoteUrl: null,
      });
    });

    it("handles detached HEAD", async () => {
      const exec = createMockExec({
        "rev-parse --abbrev-ref HEAD": { stdout: "HEAD\n", stderr: "" },
        "git log -1": { stdout: "abc123\nInitial commit\n", stderr: "" },
        "remote get-url": { stdout: "git@github.com:user/repo.git\n", stderr: "" },
      });
      const service = new GitServiceImpl(exec);

      const result = await service.getRepoInfo("/some/project");
      expect(result).toEqual({
        branch: "HEAD",
        sha: "abc123",
        commitMessage: "Initial commit",
        remoteUrl: "git@github.com:user/repo.git",
      });
    });
  });

  describe("getProjectFileInfo", () => {
    it("returns null packageJson and readme for empty path", async () => {
      const service = new GitServiceImpl();
      const result = await service.getProjectFileInfo("");
      expect(result).toEqual({ packageJson: null, readme: null });
    });

    it("parses package.json with name, description, and dependencies", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({
          name: "my-app",
          description: "A cool app",
          dependencies: { react: "^18.0.0", lodash: "^4.17.0" },
          devDependencies: { vitest: "^1.0.0" },
        }),
      });
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.packageJson).toEqual({
        name: "my-app",
        description: "A cool app",
        dependencies: ["react", "lodash"],
        devDependencies: ["vitest"],
      });
    });

    it("parses README.md first paragraph as description", async () => {
      const readmeContent = "# My Project\n\nThis is a great project.\n\n## Installation\n\nRun npm install.";
      const readFile = createMockReadFile({
        "README.md": readmeContent,
      });
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.readme?.description).toBe("This is a great project.");
      expect(result.readme?.content).toBe(readmeContent);
    });

    it("returns null when no README exists", async () => {
      const readFile = async () => { throw new Error("ENOENT"); };
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result).toEqual({ packageJson: null, readme: null });
    });

    it("returns null packageJson for malformed JSON", async () => {
      const readFile = createMockReadFile({
        "package.json": "{ invalid json {{{",
      });
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.packageJson).toBeNull();
    });

    it("handles package.json with missing fields gracefully", async () => {
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ name: "minimal-pkg" }),
      });
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.packageJson).toEqual({
        name: "minimal-pkg",
        description: null,
        dependencies: [],
        devDependencies: [],
      });
    });

    it("extracts first paragraph skipping title and blank lines", async () => {
      const content = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
      const readFile = createMockReadFile({ "README.md": content });
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.readme?.description).toBe("First paragraph.");
    });

    it("handles README with no paragraphs (only headings)", async () => {
      const content = "# Title\n## Section 1\n## Section 2\n";
      const readFile = createMockReadFile({ "README.md": content });
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.readme?.description).toBeNull();
    });

    it("tries fallback readme filenames (readme.md)", async () => {
      let triedPaths: string[] = [];
      const readFile = async (path: string, enc: BufferEncoding) => {
        triedPaths.push(path);
        if (path.endsWith("readme.md")) return "# Lowercase readme\n\nContent.";
        throw new Error("ENOENT");
      };
      const service = new GitServiceImpl(undefined, readFile);

      const result = await service.getProjectFileInfo("/some/project");
      expect(result.readme?.description).toBe("Content.");
    });
  });

  describe("getProjectMetadata", () => {
    it("returns combined repo info and file info", async () => {
      const exec = createMockExec({
        "rev-parse --abbrev-ref HEAD": { stdout: "main\n", stderr: "" },
        "git log -1": { stdout: "abc123\ncommit msg\n", stderr: "" },
        "remote get-url": { stdout: "git@github.com:user/repo.git\n", stderr: "" },
      });
      const readFile = createMockReadFile({
        "package.json": JSON.stringify({ name: "test-pkg", description: "Test" }),
        "README.md": "# Test\n\nA test project.",
      });
      const service = new GitServiceImpl(exec, readFile);

      const result = await service.getProjectMetadata("/some/project");
      expect(result.repoInfo).toEqual({
        branch: "main",
        sha: "abc123",
        commitMessage: "commit msg",
        remoteUrl: "git@github.com:user/repo.git",
      });
      expect(result.fileInfo.packageJson?.name).toBe("test-pkg");
      expect(result.fileInfo.readme?.description).toBe("A test project.");
    });

    it("returns null repoInfo and empty fileInfo for invalid path", async () => {
      const exec = async () => { throw new Error("not found"); };
      const readFile = async () => { throw new Error("ENOENT"); };
      const service = new GitServiceImpl(exec, readFile);

      const result = await service.getProjectMetadata("/nonexistent");
      expect(result.repoInfo).toBeNull();
      expect(result.fileInfo).toEqual({ packageJson: null, readme: null });
    });
  });
});
