import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync, copyFileSync, createWriteStream } from "fs";
import { join } from "path";
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

export interface DeployServiceOptions {
  createZipFn?: CreateZipFn;
  openUrl?: OpenUrlFn;
}

export class DeployServiceImpl implements DeployService {
  private createZipFn: CreateZipFn;
  private openUrl: OpenUrlFn;

  constructor(options?: DeployServiceOptions) {
    this.createZipFn = options?.createZipFn ?? defaultCreateZip;
    this.openUrl = options?.openUrl ?? defaultOpenUrl;
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
      default:
        throw new Error(`Unsupported deploy target: ${target}`);
    }
  }

  getSupportedTargets(): DeployTarget[] {
    return ["zip", "github-pages", "netlify", "vercel"];
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
    copyDirSync(portfolioDir, destDir);

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
    copyDirSync(portfolioDir, destDir);

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

  private async deployVercel(portfolioDir: string, destDir: string, config: DeployConfig): Promise<DeployResult> {
    copyDirSync(portfolioDir, destDir);

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

function listFilesRecursive(baseDir: string, currentDir: string): Array<{ absolute: string; relative: string }> {
  const results: Array<{ absolute: string; relative: string }> = [];
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "deploy") continue;
      results.push(...listFilesRecursive(baseDir, absolute));
    } else {
      const relative = absolute.substring(baseDir.length + 1).replace(/\\/g, "/");
      results.push({ absolute, relative });
    }
  }

  return results;
}

function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}
