import type {
  LocalModel,
  AiConfig,
  AiService,
  ProjectAiInput,
  ProjectAiDescription,
  ScreenshotCaptionInput,
  ScreenshotCaption,
  PortfolioSummaryInput,
  PortfolioSummary,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  modelPath: null,
  maxTokens: 512,
  temperature: 0.7,
};

export class HeuristicModel implements LocalModel {
  async infer(context: string): Promise<string> {
    const lines = context.split("\n").filter((l) => l.trim());
    const keyLines = lines.filter((l) => l.startsWith("KEY:"));
    if (keyLines.length > 0) {
      return keyLines.map((l) => l.replace("KEY:", "").trim()).join(". ");
    }
    return lines.slice(0, 3).join(" ");
  }
}

function hashInput(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export class LocalAiServiceImpl implements AiService {
  private config: AiConfig;
  private model: LocalModel;
  private cache: Map<string, unknown> = new Map();

  constructor(model?: LocalModel, config?: Partial<AiConfig>) {
    this.model = model ?? new HeuristicModel();
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
  }

  getStatus(): { enabled: boolean; modelLoaded: boolean; cacheSize: number } {
    return {
      enabled: this.config.enabled,
      modelLoaded: this.model !== null,
      cacheSize: this.cache.size,
    };
  }

  setConfig(config: Partial<AiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async generateProjectDescription(input: ProjectAiInput): Promise<ProjectAiDescription> {
    if (!input.projectName) throw new Error("projectName is required");

    if (!this.config.enabled) {
      return this.fallbackDescription(input);
    }

    const cacheKey = `desc:${hashInput(JSON.stringify(input))}`;
    const cached = this.cache.get(cacheKey) as ProjectAiDescription | undefined;
    if (cached) return cached;

    try {
      const prompt = this.buildDescriptionPrompt(input);
      const result = await this.model.infer(prompt);
      const parsed = this.parseDescriptionResult(result, input);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return this.fallbackDescription(input);
    }
  }

  async generateScreenshotCaption(input: ScreenshotCaptionInput): Promise<ScreenshotCaption> {
    if (!input.screenshotPath) throw new Error("screenshotPath is required");

    if (!this.config.enabled) {
      return this.fallbackCaption(input);
    }

    const cacheKey = `cap:${hashInput(JSON.stringify(input))}`;
    const cached = this.cache.get(cacheKey) as ScreenshotCaption | undefined;
    if (cached) return cached;

    try {
      const prompt = this.buildCaptionPrompt(input);
      const result = await this.model.infer(prompt);
      const parsed = this.parseCaptionResult(result, input);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return this.fallbackCaption(input);
    }
  }

  async generatePortfolioSummary(input: PortfolioSummaryInput): Promise<PortfolioSummary> {
    if (!input.projectName) throw new Error("projectName is required");

    if (!this.config.enabled) {
      return this.fallbackSummary(input);
    }

    const cacheKey = `sum:${hashInput(JSON.stringify(input))}`;
    const cached = this.cache.get(cacheKey) as PortfolioSummary | undefined;
    if (cached) return cached;

    try {
      const prompt = this.buildSummaryPrompt(input);
      const result = await this.model.infer(prompt);
      const parsed = this.parseSummaryResult(result, input);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return this.fallbackSummary(input);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private fallbackDescription(input: ProjectAiInput): ProjectAiDescription {
    const desc = input.description ?? `${input.projectName} is a software project`;
    const features = input.features.length > 0
      ? input.features
      : ["Core functionality"];
    const tech = input.techStack.length > 0
      ? input.techStack.join(", ")
      : "Software";

    return {
      title: input.projectName,
      description: desc,
      featureList: features,
      techSummary: tech,
    };
  }

  private fallbackCaption(input: ScreenshotCaptionInput): ScreenshotCaption {
    const feature = input.featureContext ?? "application";
    return {
      caption: `Screenshot of ${input.projectName} — ${feature}`,
      confidence: 0.3,
    };
  }

  private fallbackSummary(input: PortfolioSummaryInput): PortfolioSummary {
    const techStr = input.techStack.length > 0 ? input.techStack.join(", ") : "various technologies";
    const highlights: string[] = [];
    if (input.featureCount > 0) highlights.push(`${input.featureCount} feature(s)`);
    if (input.sessionCount > 0) highlights.push(`${input.sessionCount} recording(s)`);
    if (input.techStack.length > 0) highlights.push(`Built with ${techStr}`);

    return {
      summary: `${input.projectName} — ${input.description ?? "A software project"}. ${highlights.join(". ")}.`,
      highlights,
    };
  }

  private buildDescriptionPrompt(input: ProjectAiInput): string {
    const parts: string[] = [];
    parts.push(`PROJECT: ${input.projectName}`);
    if (input.description) parts.push(`KEY: ${input.description}`);
    if (input.readmeContent) parts.push(`README: ${input.readmeContent.slice(0, 1000)}`);
    if (input.features.length > 0) parts.push(`KEY: Features: ${input.features.join(", ")}`);
    if (input.techStack.length > 0) parts.push(`KEY: Tech: ${input.techStack.join(", ")}`);
    if (input.gitCommitMessage) parts.push(`KEY: Recent: ${input.gitCommitMessage}`);
    if (input.featureNames.length > 0) parts.push(`KEY: Detected: ${input.featureNames.join(", ")}`);
    return parts.join("\n");
  }

  private buildCaptionPrompt(input: ScreenshotCaptionInput): string {
    const parts: string[] = [];
    parts.push(`PROJECT: ${input.projectName}`);
    if (input.featureContext) parts.push(`KEY: Feature: ${input.featureContext}`);
    parts.push(`KEY: Screenshot at ${Math.round(input.timestampMs / 1000)}s`);
    return parts.join("\n");
  }

  private buildSummaryPrompt(input: PortfolioSummaryInput): string {
    const parts: string[] = [];
    parts.push(`PROJECT: ${input.projectName}`);
    if (input.description) parts.push(`KEY: ${input.description}`);
    parts.push(`KEY: ${input.featureCount} features, ${input.sessionCount} recordings`);
    if (input.techStack.length > 0) parts.push(`KEY: Tech: ${input.techStack.join(", ")}`);
    return parts.join("\n");
  }

  private parseDescriptionResult(result: string, input: ProjectAiInput): ProjectAiDescription {
    const lines = result.split("\n").filter((l) => l.trim());
    const description = lines.length > 0 ? lines[0] : this.fallbackDescription(input).description;
    return {
      title: input.projectName,
      description,
      featureList: input.features.length > 0 ? input.features : lines.slice(1),
      techSummary: input.techStack.length > 0 ? input.techStack.join(", ") : "Software",
    };
  }

  private parseCaptionResult(result: string, input: ScreenshotCaptionInput): ScreenshotCaption {
    const caption = result.trim() || this.fallbackCaption(input).caption;
    return { caption, confidence: 0.7 };
  }

  private parseSummaryResult(result: string, input: PortfolioSummaryInput): PortfolioSummary {
    const lines = result.split("\n").filter((l) => l.trim());
    const summary = lines.length > 0 ? lines[0] : this.fallbackSummary(input).summary;
    const highlights = lines.slice(1).filter((l) => l.trim());
    return { summary, highlights };
  }
}
