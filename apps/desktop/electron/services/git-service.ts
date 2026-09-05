import type { GitRepoInfo, ProjectFileInfo, ProjectMetadata, PackageJsonInfo, ReadmeInfo } from "../../../../packages/shared/types/index.js";
import { exec as defaultExec } from "child_process";
import { readFile as defaultReadFile } from "fs/promises";
import { join } from "path";

type ExecFn = (cmd: string, options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;
type ReadFileFn = (path: string, encoding: BufferEncoding) => Promise<string>;

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
}

export class GitServiceImpl {
  private execFn: ExecFn;
  private readFileFn: ReadFileFn;

  constructor(execFn?: ExecFn, readFileFn?: ReadFileFn) {
    this.execFn = execFn ?? ((cmd, opts) => new Promise((resolve, reject) => {
      defaultExec(cmd, { cwd: opts.cwd, encoding: "utf-8" }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
      });
    }));
    this.readFileFn = readFileFn ?? defaultReadFile;
  }

  async getRepoInfo(projectPath: string): Promise<GitRepoInfo | null> {
    if (!projectPath) return null;

    try {
      const [branchResult, shaResult, remoteResult] = await Promise.allSettled([
        this.execFn("git rev-parse --abbrev-ref HEAD", { cwd: projectPath }),
        this.execFn('git log -1 --format=%H%n%s', { cwd: projectPath }),
        this.execFn("git remote get-url origin", { cwd: projectPath }),
      ]);

      const branch = branchResult.status === "fulfilled" ? branchResult.value.stdout.trim() : null;
      const shaLines = shaResult.status === "fulfilled" ? shaResult.value.stdout.trim().split("\n") : [];
      const sha = shaLines[0] ?? null;
      const commitMessage = shaLines[1] ?? null;
      const remoteUrl = remoteResult.status === "fulfilled" ? remoteResult.value.stdout.trim() : null;

      if (!branch && !sha) return null;

      return { branch, sha, commitMessage, remoteUrl };
    } catch {
      return null;
    }
  }

  async getProjectFileInfo(projectPath: string): Promise<ProjectFileInfo> {
    if (!projectPath) return { packageJson: null, readme: null };

    const [packageJson, readme] = await Promise.allSettled([
      this.readPackageJson(projectPath),
      this.readReadme(projectPath),
    ]);

    return {
      packageJson: packageJson.status === "fulfilled" ? packageJson.value : null,
      readme: readme.status === "fulfilled" ? readme.value : null,
    };
  }

  async getProjectMetadata(projectPath: string): Promise<ProjectMetadata> {
    const [repoInfo, fileInfo] = await Promise.all([
      this.getRepoInfo(projectPath),
      this.getProjectFileInfo(projectPath),
    ]);

    return { repoInfo, fileInfo };
  }

  private async readPackageJson(projectPath: string): Promise<PackageJsonInfo | null> {
    try {
      const content = await this.readFileFn(join(projectPath, "package.json"), "utf-8");
      const pkg = JSON.parse(content) as Record<string, unknown>;

      return {
        name: typeof pkg.name === "string" ? pkg.name : null,
        description: typeof pkg.description === "string" ? pkg.description : null,
        dependencies: parseJsonArray(pkg.dependencies),
        devDependencies: parseJsonArray(pkg.devDependencies),
      };
    } catch {
      return null;
    }
  }

  private async readReadme(projectPath: string): Promise<ReadmeInfo | null> {
    const filenames = ["README.md", "README", "readme.md", "readme"];

    for (const filename of filenames) {
      try {
        const content = await this.readFileFn(join(projectPath, filename), "utf-8");
        const description = this.extractFirstParagraph(content);
        return { description, content };
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractFirstParagraph(content: string): string | null {
    const lines = content.split("\n");
    const paragraphLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        if (paragraphLines.length > 0) break;
        continue;
      }

      if (trimmed.startsWith("#")) {
        continue;
      }

      paragraphLines.push(trimmed);
    }

    return paragraphLines.length > 0 ? paragraphLines.join(" ").trim() : null;
  }
}
