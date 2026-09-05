import type { FeatureEvidence, FeatureEvidenceInput, FeatureEvidenceUpdateInput, FeatureEvidenceCommit, GitService, FeatureEvidenceService } from "../../../../packages/shared/types/index.js";
import type { FeatureEvidenceRepository } from "../../../../packages/database/repositories/feature-evidence-repository.js";
import type { ProjectRepository } from "../../../../packages/database/repositories/project-repository.js";
import type { SessionRepository } from "../../../../packages/database/repositories/session-repository.js";
import type { AssetRepository } from "../../../../packages/database/repositories/asset-repository.js";
import { exec as defaultExec } from "child_process";

type ExecFn = (cmd: string, options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;

export class FeatureEvidenceServiceImpl implements FeatureEvidenceService {
  private execFn: ExecFn;

  constructor(
    private evidenceRepo: FeatureEvidenceRepository,
    private projectRepo: ProjectRepository,
    private sessionRepo: SessionRepository,
    private assetRepo: AssetRepository,
    private gitService: GitService,
    execFn?: ExecFn,
  ) {
    this.execFn = execFn ?? ((cmd, opts) => new Promise((resolve, reject) => {
      defaultExec(cmd, { cwd: opts.cwd, encoding: "utf-8" }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
      });
    }));
  }

  async generate(projectId: string): Promise<FeatureEvidence[]> {
    if (!projectId) throw new Error("projectId is required");

    const project = this.projectRepo.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const [commits, sessions, readme] = await Promise.all([
      this.getGitCommits(project.path),
      this.sessionRepo.listByProject(projectId),
      this.gitService.getProjectFileInfo(project.path).then((f) => f.readme?.content ?? null),
    ]);

    const screenshots: string[] = [];
    const segments: string[] = [];
    for (const session of sessions) {
      const assets = this.assetRepo.listBySession(session.id);
      for (const asset of assets) {
        if (asset.type === "screenshot") screenshots.push(asset.path);
        if (asset.type === "trimmed_video" || asset.type === "demo_video") segments.push(asset.path);
      }
    }

    const featureGroups = this.groupCommitsByFeature(commits);
    const results: FeatureEvidence[] = [];

    for (const [featureName, groupCommits] of featureGroups) {
      const nearbyScreenshots = this.findNearbyAssets(screenshots, groupCommits, 60_000);
      const nearbySegments = this.findNearbyAssets(segments, groupCommits, 60_000);
      const readmeSnippet = this.extractReadmeSnippet(readme, featureName);

      const confidence = this.computeConfidence(groupCommits.length, nearbyScreenshots.length, nearbySegments.length, !!readmeSnippet);

      const evidence = this.evidenceRepo.create({
        projectId,
        featureName,
        description: `Feature inferred from ${groupCommits.length} commit(s)`,
        confidence,
        commits: groupCommits,
        screenshotPaths: nearbyScreenshots,
        recordingSegmentPaths: nearbySegments,
        readmeSnippet,
      });

      results.push(evidence);
    }

    if (featureGroups.size === 0 && commits.length > 0) {
      const confidence = this.computeConfidence(commits.length, screenshots.length, segments.length, !!readme);
      const evidence = this.evidenceRepo.create({
        projectId,
        featureName: this.inferProjectFeatureName(project.name, commits),
        description: `Project-level feature inferred from ${commits.length} commit(s)`,
        confidence,
        commits,
        screenshotPaths: screenshots.slice(0, 5),
        recordingSegmentPaths: segments.slice(0, 3),
        readmeSnippet: readme ? readme.slice(0, 500) : null,
      });
      results.push(evidence);
    }

    return results;
  }

  list(projectId: string): FeatureEvidence[] {
    if (!projectId) throw new Error("projectId is required");
    return this.evidenceRepo.listByProject(projectId);
  }

  getById(id: string): FeatureEvidence | null {
    if (!id) throw new Error("id is required");
    return this.evidenceRepo.getById(id);
  }

  save(input: FeatureEvidenceInput): FeatureEvidence {
    if (!input.projectId) throw new Error("projectId is required");
    if (!input.featureName) throw new Error("featureName is required");

    const project = this.projectRepo.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    return this.evidenceRepo.create(input);
  }

  update(id: string, input: FeatureEvidenceUpdateInput): FeatureEvidence {
    if (!id) throw new Error("id is required");

    const existing = this.evidenceRepo.getById(id);
    if (!existing) throw new Error(`Feature evidence not found: ${id}`);

    const updated = this.evidenceRepo.update(id, input);
    return updated!;
  }

  accept(id: string): FeatureEvidence {
    if (!id) throw new Error("id is required");
    const existing = this.evidenceRepo.getById(id);
    if (!existing) throw new Error(`Feature evidence not found: ${id}`);
    return this.evidenceRepo.update(id, { status: "accepted" })!;
  }

  reject(id: string): FeatureEvidence {
    if (!id) throw new Error("id is required");
    const existing = this.evidenceRepo.getById(id);
    if (!existing) throw new Error(`Feature evidence not found: ${id}`);
    return this.evidenceRepo.update(id, { status: "rejected" })!;
  }

  delete(id: string): void {
    if (!id) throw new Error("id is required");
    const existing = this.evidenceRepo.getById(id);
    if (!existing) throw new Error(`Feature evidence not found: ${id}`);
    this.evidenceRepo.delete(id);
  }

  private async getGitCommits(projectPath: string): Promise<FeatureEvidenceCommit[]> {
    try {
      const result = await this.execFn(
        'git log --format=%H|%s|%ai -50',
        { cwd: projectPath },
      );

      return result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [sha, message, date] = line.split("|");
          return { sha: sha.trim(), message: message.trim(), date: date.trim() };
        });
    } catch {
      return [];
    }
  }

  private groupCommitsByFeature(commits: FeatureEvidenceCommit[]): Map<string, FeatureEvidenceCommit[]> {
    const groups = new Map<string, FeatureEvidenceCommit[]>();

    for (const commit of commits) {
      const featureName = this.extractFeatureName(commit.message);
      const existing = groups.get(featureName) ?? [];
      existing.push(commit);
      groups.set(featureName, existing);
    }

    const merged = new Map<string, FeatureEvidenceCommit[]>();
    for (const [name, group] of groups) {
      if (group.length >= 2) {
        merged.set(name, group);
      }
    }

    return merged;
  }

  private extractFeatureName(message: string): string {
    const cleaned = message
      .replace(/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build)(\(.+?\))?:\s*/i, "")
      .replace(/^[A-Z]/, (c) => c.toLowerCase())
      .trim();

    if (!cleaned) return "general";

    const words = cleaned.split(/\s+/).slice(0, 4);
    return words.join(" ");
  }

  private inferProjectFeatureName(projectName: string, commits: FeatureEvidenceCommit[]): string {
    if (commits.length === 0) return projectName;
    return this.extractFeatureName(commits[0].message);
  }

  private findNearbyAssets(paths: string[], commits: FeatureEvidenceCommit[], windowMs: number): string[] {
    if (commits.length === 0 || paths.length === 0) return [];

    const commitDates = commits
      .map((c) => new Date(c.date).getTime())
      .filter((t) => !isNaN(t));

    if (commitDates.length === 0) return [];

    const minDate = Math.min(...commitDates);
    const maxDate = Math.max(...commitDates);

    return paths.filter((_, index) => {
      const approximateAssetTime = minDate + (index * (maxDate - minDate + windowMs)) / paths.length;
      return approximateAssetTime >= minDate - windowMs && approximateAssetTime <= maxDate + windowMs;
    });
  }

  private extractReadmeSnippet(readme: string | null, featureName: string): string | null {
    if (!readme) return null;

    const lower = readme.toLowerCase();
    const featureLower = featureName.toLowerCase();
    const idx = lower.indexOf(featureLower);

    if (idx === -1) return null;

    const start = Math.max(0, idx - 100);
    const end = Math.min(readme.length, idx + featureName.length + 200);
    return readme.slice(start, end).trim();
  }

  private computeConfidence(
    commitCount: number,
    screenshotCount: number,
    segmentCount: number,
    hasReadme: boolean,
  ): number {
    let score = 0;
    score += Math.min(commitCount * 0.15, 0.45);
    score += Math.min(screenshotCount * 0.1, 0.25);
    score += Math.min(segmentCount * 0.1, 0.2);
    if (hasReadme) score += 0.1;
    return Math.round(Math.min(score, 1) * 100) / 100;
  }
}
