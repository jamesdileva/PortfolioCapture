import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import type {
  ExportBundleConfig,
  ExportBundleResult,
  ExportService,
} from "../../../../packages/shared/types/index.js";
import type { ProjectService } from "./project-service.js";
import type { SessionService } from "./session-service.js";
import type { AssetService } from "./asset-service.js";

const DEFAULT_EXPORT_DIR = "data/exports";

export class ExportServiceImpl implements ExportService {
  private projectService: ProjectService;
  private sessionService: SessionService;
  private assetService: AssetService;
  private defaultExportDir: string;

  constructor(
    projectService: ProjectService,
    sessionService: SessionService,
    assetService: AssetService,
    defaultExportDir?: string,
  ) {
    this.projectService = projectService;
    this.sessionService = sessionService;
    this.assetService = assetService;
    this.defaultExportDir = defaultExportDir ?? DEFAULT_EXPORT_DIR;
  }

  async exportProject(
    projectId: string,
    config?: Partial<ExportBundleConfig>,
  ): Promise<ExportBundleResult> {
    if (!projectId) throw new Error("Project ID is required");

    const project = this.projectService.getById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const outputDir = config?.outputDir ?? this.defaultExportDir;
    const projectName = project.name.replace(/[<>:"/\\|?*]/g, "_");
    const exportPath = join(outputDir, projectName);

    if (!existsSync(exportPath)) {
      mkdirSync(exportPath, { recursive: true });
    }

    const sessions = this.sessionService.listByProject(projectId);
    const completeSessions = sessions.filter((s) => s.status === "complete");

    let demoIncluded = false;
    let screenshotCount = 0;

    if (completeSessions.length > 0) {
      const latestSession = completeSessions[0];
      const assets = this.assetService.listBySession(latestSession.id);

      const demoAsset = assets.find((a) => a.type === "demo_video");
      if (demoAsset && existsSync(demoAsset.path)) {
        copyFileSync(demoAsset.path, join(exportPath, "demo.mp4"));
        demoIncluded = true;
      }

      const screenshots = assets.filter((a) => a.type === "screenshot");
      if (screenshots.length > 0) {
        const screenshotsDir = join(exportPath, "screenshots");
        if (!existsSync(screenshotsDir)) {
          mkdirSync(screenshotsDir, { recursive: true });
        }
        for (const shot of screenshots) {
          if (existsSync(shot.path)) {
            const destName = basename(shot.path);
            copyFileSync(shot.path, join(screenshotsDir, destName));
            screenshotCount++;
          }
        }
      }
    }

    const metadata = {
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        description: project.description,
        features: project.features,
        techStack: project.techStack,
        githubUrl: project.githubUrl,
        projectStatus: project.projectStatus,
      },
      exportedAt: new Date().toISOString(),
      sessionCount: completeSessions.length,
    };

    writeFileSync(
      join(exportPath, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const readmeParts = [`# ${project.name}\n`];
    if (project.description) readmeParts.push(`\n${project.description}\n`);
    if (project.techStack.length > 0) readmeParts.push(`\n**Tech Stack:** ${project.techStack.join(", ")}\n`);
    if (project.features.length > 0) readmeParts.push(`\n**Features:**\n${project.features.map((f) => `- ${f}`).join("\n")}\n`);
    if (project.githubUrl) readmeParts.push(`\n**GitHub:** ${project.githubUrl}\n`);
    readmeParts.push(`\nExported from Portfolio Auto Recorder on ${metadata.exportedAt}.\n\nSessions: ${completeSessions.length}\n`);

    writeFileSync(join(exportPath, "README.md"), readmeParts.join(""), "utf-8");

    return {
      exportPath,
      demoIncluded,
      screenshotCount,
      metadataIncluded: true,
      readmeIncluded: true,
    };
  }
}
