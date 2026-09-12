import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DeployServiceImpl } from "../../apps/desktop/electron/services/deploy-service.js";

const TEMP = path.join(process.env.TEMP || process.env.TMP || "C:\\Temp", "deploy-test-" + Date.now());

function makeService() {
  return new DeployServiceImpl({
    createZipFn: async (src: string, dest: string) => {
      let count = 0;
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p); else count++;
        }
      };
      walk(src);
      fs.writeFileSync(dest, `fake-zip-of-${count}-files`);
      return count;
    },
    openUrl: async () => {},
  });
}

function setupPortfolio(): string {
  const dir = path.join(TEMP, "portfolio-" + Date.now());
  fs.mkdirSync(path.join(dir, "projects"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "data.json"), "{}");
  fs.writeFileSync(path.join(dir, "projects", "p.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "assets", "demo.mp4"), "fake");
  return dir;
}

describe("DeployServiceImpl", () => {
  it("getSupportedTargets", () => {
    expect(makeService().getSupportedTargets()).toEqual(["zip", "github-pages", "netlify", "vercel", "github-push"]);
  });

  it("zipExport throws on empty dir", async () => {
    await expect(makeService().zipExport({ portfolioDir: "" })).rejects.toThrow("Portfolio directory is required");
  });

  it("zipExport throws on missing dir", async () => {
    await expect(makeService().zipExport({ portfolioDir: "/nonexistent" })).rejects.toThrow("Portfolio directory does not exist");
  });

  it("zipExport creates zip", async () => {
    const dir = setupPortfolio();
    const result = await makeService().zipExport({ portfolioDir: dir });
    expect(result.fileCount).toBe(4);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("previewLocal throws on empty", async () => {
    await expect(makeService().previewLocal("")).rejects.toThrow("Portfolio directory is required");
  });

  it("previewLocal throws on missing index.html", async () => {
    const dir = path.join(TEMP, "empty-" + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    await expect(makeService().previewLocal(dir)).rejects.toThrow("No index.html found");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("previewLocal calls openUrl", async () => {
    const dir = setupPortfolio();
    let url = "";
    const s = new DeployServiceImpl({ createZipFn: async () => 0, openUrl: async (u: string) => { url = u; } });
    await s.previewLocal(dir);
    expect(url).toBe(path.join(dir, "index.html"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy github-pages", async () => {
    const dir = setupPortfolio();
    const out = path.join(TEMP, "gh-" + Date.now());
    const result = await makeService().deploy({ target: "github-pages", portfolioDir: dir, outputDir: out });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(out, ".nojekyll"))).toBe(true);
    expect(fs.existsSync(path.join(out, "index.html"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy netlify", async () => {
    const dir = setupPortfolio();
    const out = path.join(TEMP, "nl-" + Date.now());
    const result = await makeService().deploy({ target: "netlify", portfolioDir: dir, outputDir: out });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(out, "netlify.toml"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy vercel", async () => {
    const dir = setupPortfolio();
    const out = path.join(TEMP, "vc-" + Date.now());
    const result = await makeService().deploy({ target: "vercel", portfolioDir: dir, outputDir: out });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(out, "vercel.json"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy zip", async () => {
    const dir = setupPortfolio();
    const out = path.join(TEMP, "zip-" + Date.now());
    const result = await makeService().deploy({ target: "zip", portfolioDir: dir, outputDir: out });
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.outputPath!)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy throws on missing dir", async () => {
    await expect(makeService().deploy({ target: "netlify", portfolioDir: "/nope" })).rejects.toThrow("Portfolio directory does not exist");
  });

  it("deploy throws on unsupported target", async () => {
    const dir = setupPortfolio();
    await expect(makeService().deploy({ target: "bad" as never, portfolioDir: dir })).rejects.toThrow("Unsupported deploy target");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy into nested default dir does not recurse into itself", async () => {
    const dir = setupPortfolio();
    const result = await makeService().deploy({ target: "github-pages", portfolioDir: dir });
    expect(result.success).toBe(true);
    const nested = path.join(result.outputPath!, "deploy");
    expect(fs.existsSync(nested)).toBe(false);
    expect(fs.existsSync(path.join(result.outputPath!, "index.html"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deploy refuses outputDir equal to portfolioDir", async () => {
    const dir = setupPortfolio();
    await expect(makeService().deploy({ target: "netlify", portfolioDir: dir, outputDir: dir })).rejects.toThrow("into itself");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("github-push", () => {
    function makeGitService(calls: string[][], behavior: (args: string[]) => string) {
      return new DeployServiceImpl({
        createZipFn: async () => 0,
        openUrl: async () => {},
        execGit: (args: string[], cwd: string) => {
          calls.push([cwd, ...args]);
          return behavior(args);
        },
      });
    }

    function setupRepo(): string {
      const repo = path.join(TEMP, "repo-" + Date.now() + Math.floor(Math.random() * 10000));
      fs.mkdirSync(repo, { recursive: true });
      fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
      fs.writeFileSync(path.join(repo, "index.html"), "site");
      return repo;
    }

    const okBehavior = (args: string[]) => {
      if (args[0] === "status") return " M portfolio/index.html";
      if (args[0] === "rev-parse" && args[1] === "--short") return "abc1234";
      return "";
    };

    it("copies, commits and pushes into repo subfolder", async () => {
      const dir = setupPortfolio();
      const repo = setupRepo();
      const calls: string[][] = [];
      const result = await makeGitService(calls, okBehavior).deploy({
        target: "github-push",
        portfolioDir: dir,
        repoPath: repo,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("abc1234");
      expect(fs.existsSync(path.join(repo, "portfolio", "index.html"))).toBe(true);
      expect(fs.existsSync(path.join(repo, "index.html"))).toBe(true); // site root untouched
      const flat = calls.map((c) => c.slice(1).join(" "));
      expect(flat).toContain("add -A -- portfolio");
      expect(flat.some((c) => c.startsWith("commit -m"))).toBe(true);
      expect(flat).toContain("push");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it("throws when repoPath missing", async () => {
      const dir = setupPortfolio();
      await expect(makeGitService([], okBehavior).deploy({ target: "github-push", portfolioDir: dir })).rejects.toThrow("repoPath");
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("throws when repoPath is not a git repo", async () => {
      const dir = setupPortfolio();
      const notRepo = path.join(TEMP, "notrepo-" + Date.now());
      fs.mkdirSync(notRepo, { recursive: true });
      await expect(makeGitService([], okBehavior).deploy({ target: "github-push", portfolioDir: dir, repoPath: notRepo })).rejects.toThrow("Not a git repository");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(notRepo, { recursive: true, force: true });
    });

    it("refuses repo root as subpath", async () => {
      const dir = setupPortfolio();
      const repo = setupRepo();
      await expect(makeGitService([], okBehavior).deploy({ target: "github-push", portfolioDir: dir, repoPath: repo, repoSubPath: "." })).rejects.toThrow("repo root");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it("reports up-to-date when nothing changed", async () => {
      const dir = setupPortfolio();
      const repo = setupRepo();
      const result = await makeGitService([], () => "").deploy({ target: "github-push", portfolioDir: dir, repoPath: repo });
      expect(result.success).toBe(true);
      expect(result.message).toContain("up to date");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it("surfaces push failure after local commit", async () => {
      const dir = setupPortfolio();
      const repo = setupRepo();
      const behavior = (args: string[]) => {
        if (args[0] === "status") return " M portfolio/index.html";
        if (args[0] === "rev-parse" && args[1] === "--short") return "abc1234";
        if (args[0] === "push") throw new Error("remote: permission denied");
        return "";
      };
      await expect(makeGitService([], behavior).deploy({ target: "github-push", portfolioDir: dir, repoPath: repo })).rejects.toThrow(/Committed abc1234.*push failed/);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    });
  });
});
