import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────

export const SessionStatusSchema = z.enum([
  "starting",
  "recording",
  "paused",
  "finalizing",
  "processing",
  "complete",
  "failed",
  "cancelled",
]);

export const SessionTriggerSchema = z.enum([
  "manual",
  "process_launch",
  "dev_server_launch",
  "hotkey",
  "scheduled",
]);

export const AssetTypeSchema = z.enum([
  "raw_video",
  "trimmed_video",
  "demo_video",
  "highlight",
  "screenshot",
  "thumbnail",
  "gif",
  "export",
]);

export const ProjectStatusSchema = z.enum([
  "active",
  "paused",
  "archived",
  "completed",
]);

export const AudioModeSchema = z.enum(["none", "system", "microphone", "both"]);

export const CaptureModeSchema = z.enum(["desktop", "window"]);

export const ProfilePresetNameSchema = z.enum([
  "quick_demo",
  "portfolio_demo",
  "long_session",
  "screenshot_only",
  "manual",
]);

export const PortfolioThemeNameSchema = z.enum([
  "minimal",
  "developer",
  "dark",
  "grid",
  "resume",
]);

export const DeployTargetSchema = z.enum([
  "zip",
  "github-pages",
  "netlify",
  "vercel",
]);

export const FeatureEvidenceStatusSchema = z.enum([
  "candidate",
  "accepted",
  "rejected",
]);

// ─── Project Schemas ─────────────────────────────────────────────

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  path: z.string().min(1, "Project path is required"),
  executablePath: z.string().nullable().optional(),
  launchCommand: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  autoRecord: z.boolean().optional(),
  description: z.string().nullable().optional(),
  features: z.array(z.string()).optional(),
  techStack: z.array(z.string()).optional(),
  githubUrl: z.string().nullable().optional(),
  projectStatus: ProjectStatusSchema.optional(),
  devServerPorts: z.array(z.number().int().nonnegative()).optional(),
});

export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  executablePath: z.string().nullable().optional(),
  launchCommand: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  autoRecord: z.boolean().optional(),
  description: z.string().nullable().optional(),
  features: z.array(z.string()).optional(),
  techStack: z.array(z.string()).optional(),
  githubUrl: z.string().nullable().optional(),
  projectStatus: ProjectStatusSchema.optional(),
  devServerPorts: z.array(z.number().int().nonnegative()).optional(),
});

// ─── Session Schemas ─────────────────────────────────────────────

export const CreateSessionInputSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  trigger: SessionTriggerSchema,
});

// ─── Asset Schemas ───────────────────────────────────────────────

export const CreateAssetInputSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  projectId: z.string().min(1, "Project ID is required"),
  type: AssetTypeSchema,
  path: z.string().min(1, "Path is required"),
  durationMs: z.number().nonnegative().optional(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  fileSizeBytes: z.number().nonnegative().optional(),
});

// ─── Profile Schemas ─────────────────────────────────────────────

export const RecordingProfileSettingsSchema = z.object({
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  audio: AudioModeSchema,
  idleTimeoutMs: z.number().nonnegative(),
  minIdleDurationMs: z.number().nonnegative(),
  maxScreenshots: z.number().int().nonnegative(),
  demoTargetDurationMs: z.number().positive(),
  demoMinDurationMs: z.number().positive(),
  demoMaxDurationMs: z.number().positive(),
  screenshotsOnly: z.boolean(),
  captureMode: CaptureModeSchema.optional(),
  windowTitle: z.string().optional(),
});

export const CreateProfileInputSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  description: z.string().optional(),
  settings: z.record(z.unknown()),
  presetName: ProfilePresetNameSchema.optional(),
});

export const UpdateProfileInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

// ─── Overrides Schemas ──────────────────────────────────────────

export const TimelineOverridesSchema = z.object({
  selectedIndices: z.array(z.number().int().nonnegative()),
  removedIndices: z.array(z.number().int().nonnegative()),
  thumbnailTimestampMs: z.number().nonnegative().nullable(),
  highlightIndices: z.array(z.number().int().nonnegative()),
  customOrder: z.array(z.number().int().nonnegative()).nullable(),
});

// ─── Feature Evidence Schemas ───────────────────────────────────

export const FeatureEvidenceCommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  date: z.string(),
});

export const FeatureEvidenceInputSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  featureName: z.string().min(1, "Feature name is required"),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  commits: z.array(FeatureEvidenceCommitSchema).optional(),
  screenshotPaths: z.array(z.string()).optional(),
  recordingSegmentPaths: z.array(z.string()).optional(),
  readmeSnippet: z.string().nullable().optional(),
});

export const FeatureEvidenceUpdateInputSchema = z.object({
  featureName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: FeatureEvidenceStatusSchema.optional(),
  commits: z.array(FeatureEvidenceCommitSchema).optional(),
  screenshotPaths: z.array(z.string()).optional(),
  recordingSegmentPaths: z.array(z.string()).optional(),
  readmeSnippet: z.string().nullable().optional(),
});

// ─── Chapter Schemas ────────────────────────────────────────────

export const FeatureChapterSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative().nullable(),
  featureName: z.string().nullable(),
  sceneScore: z.number(),
});

export const FeatureChapterListSchema = z.object({
  sessionId: z.string(),
  chapters: z.array(FeatureChapterSchema),
  totalDurationMs: z.number().nonnegative(),
  generatedAt: z.string(),
});

export const SceneSchema = z.object({
  timestampMs: z.number().nonnegative(),
  score: z.number(),
});

export const FeatureChapterGeneratorConfigSchema = z.object({
  minChapterDurationMs: z.number().nonnegative().optional(),
  mergeGapMs: z.number().nonnegative().optional(),
  titleSource: z.enum(["scene", "feature", "hybrid"]).optional(),
  scenes: z.array(SceneSchema).optional(),
});

// ─── Deploy Schemas ─────────────────────────────────────────────

export const ZipExportConfigSchema = z.object({
  portfolioDir: z.string().min(1, "Portfolio directory is required"),
  outputPath: z.string().optional(),
});

export const DeployConfigSchema = z.object({
  target: DeployTargetSchema,
  portfolioDir: z.string().min(1, "Portfolio directory is required"),
  siteName: z.string().optional(),
  outputDir: z.string().optional(),
});

// ─── Portfolio Schemas ──────────────────────────────────────────

export const ThemeColorConfigSchema = z.object({
  background: z.string(),
  surface: z.string(),
  text: z.string(),
  textMuted: z.string(),
  accent: z.string(),
  border: z.string(),
  statusActive: z.string(),
  statusCompleted: z.string(),
  statusPaused: z.string(),
});

export const PortfolioGenerateConfigSchema = z.object({
  outputDir: z.string().optional(),
  includeScreenshots: z.boolean().optional(),
  includeDemos: z.boolean().optional(),
  theme: PortfolioThemeNameSchema.optional(),
  customColors: ThemeColorConfigSchema.partial().optional(),
});

// ─── AI Schemas ─────────────────────────────────────────────────

export const AiConfigSchema = z.object({
  enabled: z.boolean(),
  modelPath: z.string().nullable(),
  maxTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2),
});

export const ProjectAiInputSchema = z.object({
  projectName: z.string().min(1, "Project name is required"),
  description: z.string().nullable(),
  features: z.array(z.string()),
  techStack: z.array(z.string()),
  gitBranch: z.string().nullable(),
  gitCommitMessage: z.string().nullable(),
  readmeContent: z.string().nullable(),
  screenshotPaths: z.array(z.string()),
  featureNames: z.array(z.string()),
});

export const ScreenshotCaptionInputSchema = z.object({
  screenshotPath: z.string().min(1, "Screenshot path is required"),
  projectName: z.string().min(1, "Project name is required"),
  featureContext: z.string().nullable(),
  timestampMs: z.number().nonnegative(),
});

export const PortfolioSummaryInputSchema = z.object({
  projectName: z.string().min(1, "Project name is required"),
  description: z.string().nullable(),
  featureCount: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  techStack: z.array(z.string()),
});

// ─── Quality Schemas ────────────────────────────────────────────

export const DemoQualityScoreInputSchema = z.object({
  videoDurationMs: z.number().nonnegative(),
  idleTimeMs: z.number().nonnegative(),
  screenshotCount: z.number().int().nonnegative(),
  featureCount: z.number().int().nonnegative(),
  fps: z.number().positive(),
});

export const DemoQualityScorerConfigSchema = z.object({
  weights: z.object({
    visualClarity: z.number(),
    featureCoverage: z.number(),
    deadTimeRatio: z.number(),
    durationScore: z.number(),
    screenshotQuality: z.number(),
  }).optional(),
  idealDurationMs: z.number().positive().optional(),
  durationToleranceMs: z.number().nonnegative().optional(),
});

// ─── Validation Utility ─────────────────────────────────────────

export class ValidationError extends Error {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(zodError: z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of zodError.issues) {
      const path = issue.path.join(".");
      const key = path || "(root)";
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    const summary = Object.entries(fieldErrors)
      .map(([k, msgs]) => `${k}: ${msgs.join("; ")}`)
      .join(" | ");
    super(`Validation failed: ${summary}`);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}
