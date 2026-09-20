import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync, copyFileSync, createWriteStream, rmSync } from "fs";
import { join, resolve, relative, sep, isAbsolute } from "path";
import { execFileSync } from "child_process";
import { shell } from "electron";
import * as archiver from "archiver";
import type {
  DeployService,
  DeployTarget,
  DeployConfig,
  DeployResult,
  ZipExportConfig,
  ZipExportResult,
} from "../../../../packages/shared/types/index.js";

export type CreateZipFn = (sourceDir: string, outPath: string) => Promise<number>;
export type OpenUrlFn = (url: string) => Promise<void>;
export type GitExecFn = (args: string[], cwd: string) => string;

export interface DeployServiceOptions {
  createZipFn?: CreateZipFn;
  openUrl?: OpenUrlFn;
  execGit?: GitExecFn;
}

export class DeployServiceImpl implements DeployService {
  private createZipFn: CreateZipFn;
  private openUrl: OpenUrlFn;
  private execGit: GitExecFn;

  constructor(options?: DeployServiceOptions) {
    this.createZipFn = options?.createZipFn ?? defaultCreateZip;
    this.openUrl = options?.openUrl ?? defaultOpenUrl;
    this.execGit = options?.execGit ?? defaultExecGit;
  }

  async zipExport(config: ZipExportConfig): Promise<ZipExportResult> {
    const { portfolioDir, outputPath } = config;

    if (!portfolioDir) throw new Error("Portfolio directory is required");
    if (!existsSync(portfolioDir)) {
      throw new Error(`Portfolio directory does not exist: ${portfolioDir}`);
    }

    const outPath = outputPath ?? `${portfolioDir}.zip`;
    const outDir = outPath.substring(0, outPath.lastIndexOf("/")) || outPath.substring(0, outPath.lastIndexOf("\\"));
    if (outDir && !existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    const fileCount = await this.createZipFn(portfolioDir, outPath);
    const stats = statSync(outPath);

    return {
      outputPath: outPath,
      fileSizeBytes: stats.size,
      fileCount,
    };
  }

  async previewLocal(portfolioDir: string): Promise<void> {
    if (!portfolioDir) throw new Error("Portfolio directory is required");
    const indexPath = join(portfolioDir, "index.html");
    if (!existsSync(indexPath)) {
      throw new Error(`No index.html found in ${portfolioDir}`);
    }
    await this.openUrl(indexPath);
  }

  async deploy(config: DeployConfig): Promise<DeployResult> {
    const { target, portfolioDir, outputDir } = config;

    if (!portfolioDir) throw new Error("Portfolio directory is required");
    if (!existsSync(portfolioDir)) {
      throw new Error(`Portfolio directory does not exist: ${portfolioDir}`);
    }

    const destDir = outputDir ?? join(portfolioDir, "deploy", target);
    if (isSamePath(destDir, portfolioDir)) {
      throw new Error("Refusing to deploy a directory into itself (outputDir equals portfolioDir)");
    }
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    switch (target) {
      case "zip":
        return this.deployZip(portfolioDir, destDir);
      case "github-pages":
        return this.deployGitHubPages(portfolioDir, destDir, config);
      case "netlify":
        return this.deployNetlify(portfolioDir, destDir, config);
      case "vercel":
        return this.deployVercel(portfolioDir, destDir, config);
      case "github-push":
        return this.deployGitHubPush(portfolioDir, config);
      default:
        throw new Error(`Unsupported deploy target: ${target}`);
    }
  }

  getSupportedTargets(): DeployTarget[] {
    return ["zip", "github-pages", "netlify", "vercel", "github-push"];
  }

  private async deployZip(portfolioDir: string, destDir: string): Promise<DeployResult> {
    const zipPath = join(destDir, "portfolio.zip");
    const fileCount = await this.createZipFn(portfolioDir, zipPath);
    return {
      success: true,
      target: "zip",
      outputPath: zipPath,
      message: `ZIP created with ${fileCount} files at ${zipPath}`,
    };
  }

  private async deployGitHubPages(portfolioDir: string, destDir: string, config: DeployConfig): Promise<DeployResult> {
    copyDirSync(portfolioDir, destDir, nestedExcludes(portfolioDir, destDir));

    writeFileSync(join(destDir, ".nojekyll"), "", "utf-8");

    if (config.siteName) {
      writeFileSync(join(destDir, "CNAME"), config.siteName, "utf-8");
    }

    return {
      success: true,
      target: "github-pages",
      outputPath: destDir,
      message: `GitHub Pages deployment ready at ${destDir}`,
    };
  }

  private async deployNetlify(portfolioDir: string, destDir: string, _config: DeployConfig): Promise<DeployResult> {
    copyDirSync(portfolioDir, destDir, nestedExcludes(portfolioDir, destDir));

    const toml = [
      "[build]",
      `  publish = "."`,
      "",
      "[build.processing]",
      "  skip_processing = false",
      "",
      "[build.processing.css]",
      "  bundle = true",
      "",
      "[build.processing.js]",
      "  bundle = true",
      "",
      "[build.processing.images]",
      "  compress = true",
      "",
      "[build.redirects]",
      '  from = "/*"',
      '  to = "/index.html"',
      "  status = 200",
      "",
    ].join("\n");

    writeFileSync(join(destDir, "netlify.toml"), toml, "utf-8");

    return {
      success: true,
      target: "netlify",
      outputPath: destDir,
      message: `Netlify deployment ready at ${destDir}`,
    };
  }

  private async deployGitHubPush(portfolioDir: string, config: DeployConfig): Promise<DeployResult> {
    const repoPath = config.repoPath?.trim();
    if (!repoPath) throw new Error("A local git clone path (repoPath) is required for github-push");
    if (!existsSync(repoPath)) throw new Error(`Repository path does not exist: ${repoPath}`);
    if (!existsSync(join(repoPath, ".git"))) throw new Error(`Not a git repository: ${repoPath}`);

    const subPath = (config.repoSubPath?.trim() || "portfolio").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!subPath || subPath === "." || subPath.split("/").includes("..")) {
      throw new Error(`Refusing to publish into repo root or outside the repo (repoSubPath: ${config.repoSubPath ?? ""})`);
    }
    const destDir = join(repoPath, ...subPath.split("/"));
    if (!isWithinDir(repoPath, destDir)) {
      throw new Error(`Refusing to publish outside the repository: ${destDir}`);
    }

    rmSync(destDir, { recursive: true, force: true });
    copyDirSync(portfolioDir, destDir, ["deploy"]);

    this.execGit(["add", "-A", "--", subPath], repoPath);
    const status = this.execGit(["status", "--porcelain", "--", subPath], repoPath).trim();
    if (!status) {
      return {
        success: true,
        target: "github-push",
        outputPath: destDir,
        message: `Already up to date — no changes to publish under ${subPath}/`,
      };
    }

    const message = config.commitMessage?.trim() || `Publish portfolio ${new Date().toISOString()}`;
    this.execGit(["commit", "-m", message, "--", subPath], repoPath);
    const sha = this.execGit(["rev-parse", "--short", "HEAD"], repoPath).trim();
    let pushOut: string;
    try {
      pushOut = this.execGit(["push"], repoPath).trim();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Committed ${sha} locally but push failed: ${detail}`);
    }

    return {
      success: true,
      target: "github-push",
      outputPath: destDir,
      message: `Pushed ${sha} (${subPath}/) — ${pushOut || "up to date on remote"}`,
    };
  }

  private async deployVercel(portfolioDir: string, destDir: string, config: DeployConfig): Promise<DeployResult> {
    copyDirSync(portfolioDir, destDir, nestedExcludes(portfolioDir, destDir));

    const vercelConfig = {
      version: 2,
      name: config.siteName ?? "portfolio",
      buildCommand: "",
      outputDirectory: ".",
      cleanUrls: true,
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    };

    writeFileSync(join(destDir, "vercel.json"), JSON.stringify(vercelConfig, null, 2), "utf-8");

    return {
      success: true,
      target: "vercel",
      outputPath: destDir,
      message: `Vercel deployment ready at ${destDir}`,
    };
  }
}

function defaultOpenUrl(url: string): Promise<void> {
  return shell.openPath(url).then(() => undefined);
}

function defaultExecGit(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const e = err as { stdout?: unknown; stderr?: unknown; message?: string };
    const detail = [e.stdout, e.stderr].filter((x) => typeof x === "string" && x.trim()).join("\n").trim();
    throw new Error(detail || e.message || "git command failed");
  }
}

function isWithinDir(dir: string, target: string): boolean {
  const rel = relative(resolve(dir), resolve(target));
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

function defaultCreateZip(sourceDir: string, outPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const files = listFilesRecursive(sourceDir, sourceDir);
    const output = createWriteStream(outPath);
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve(files.length));
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);
    for (const file of files) {
      archive.file(file.absolute, { name: file.relative });
    }
    archive.finalize();
  });
}

/** Hard ceiling: deeper trees are always a nesting bug, and past ~260 chars
 *  Windows paths become undeletable by normal means. Fail loudly instead. */
const MAX_COPY_DEPTH = 32;

function listFilesRecursive(baseDir: string, currentDir: string, depth = 0): Array<{ absolute: string; relative: string }> {
  if (depth > MAX_COPY_DEPTH) {    throw new Error(`Refusing to list deeper than ${MAX_COPY_DEPTH} levels under ${baseDir} (possible self-nesting)`);
  }
  const results: Array<{ absolute: string; relative: string }> = [];
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow links
    const absolute = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "deploy") continue;
      results.push(...listFilesRecursive(baseDir, absolute, depth + 1));
    } else {
      const relative = absolute.substring(baseDir.length + 1).replace(/\\/g, "/");
      results.push({ absolute, relative });
    }
  }

  return results;
}

function copyDirSync(src: string, dest: string, excludeTopLevel: string[] = [], depth = 0): void {
  if (depth > MAX_COPY_DEPTH) {
    throw new Error(`Refusing to copy deeper than ${MAX_COPY_DEPTH} levels under ${src} (possible self-nesting)`);
  }
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue; // never follow links
    if (depth === 0 && excludeTopLevel.includes(entry.name)) continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, [], depth + 1);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath);
    }
  }
}

function isSamePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/** Top-level names under `src` that must not be copied when `dest` lives inside `src`. */
function nestedExcludes(src: string, dest: string): string[] {
  const srcNorm = src.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() + "/";
  const destNorm = dest.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (!destNorm.startsWith(srcNorm)) return [];
  const rest = destNorm.slice(srcNorm.length);
  const first = rest.split("/")[0];
  return first ? [first] : [];
}
