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
    expect(makeService().getSupportedTargets()).toEqual(["zip", "github-pages", "netlify", "vercel"]);
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
});
