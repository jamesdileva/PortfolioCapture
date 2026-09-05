import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalAiServiceImpl, HeuristicModel } from "../../apps/desktop/electron/services/local-ai-service.js";
import type { LocalModel, ProjectAiInput, ScreenshotCaptionInput, PortfolioSummaryInput } from "../../packages/shared/types/index.js";

function makeProjectInput(overrides?: Partial<ProjectAiInput>): ProjectAiInput {
  return {
    projectName: "TestProject",
    description: "A test project",
    features: ["Auth", "Dashboard"],
    techStack: ["React", "TypeScript"],
    gitBranch: "main",
    gitCommitMessage: "feat: add auth",
    readmeContent: "TestProject is a cool app",
    screenshotPaths: [],
    featureNames: ["Auth", "Dashboard"],
    ...overrides,
  };
}

function makeCaptionInput(overrides?: Partial<ScreenshotCaptionInput>): ScreenshotCaptionInput {
  return {
    screenshotPath: "/screenshots/shot-001.png",
    projectName: "TestProject",
    featureContext: "Auth",
    timestampMs: 5000,
    ...overrides,
  };
}

function makeSummaryInput(overrides?: Partial<PortfolioSummaryInput>): PortfolioSummaryInput {
  return {
    projectName: "TestProject",
    description: "A test project",
    featureCount: 3,
    sessionCount: 5,
    techStack: ["React", "TypeScript"],
    ...overrides,
  };
}

describe("HeuristicModel", () => {
  it("extracts KEY: lines from context", async () => {
    const model = new HeuristicModel();
    const result = await model.infer("KEY: Hello world\nKEY: Second line");
    expect(result).toBe("Hello world. Second line");
  });

  it("falls back to first 3 lines when no KEY: lines", async () => {
    const model = new HeuristicModel();
    const result = await model.infer("Line one\nLine two\nLine three\nLine four");
    expect(result).toBe("Line one Line two Line three");
  });

  it("handles empty context", async () => {
    const model = new HeuristicModel();
    const result = await model.infer("");
    expect(result).toBe("");
  });

  it("handles single line", async () => {
    const model = new HeuristicModel();
    const result = await model.infer("Only line");
    expect(result).toBe("Only line");
  });
});

describe("LocalAiServiceImpl", () => {
  describe("getStatus", () => {
    it("returns disabled by default", () => {
      const service = new LocalAiServiceImpl();
      const status = service.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.modelLoaded).toBe(true);
      expect(status.cacheSize).toBe(0);
    });

    it("returns enabled when configured", () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: true });
      expect(service.getStatus().enabled).toBe(true);
    });
  });

  describe("setConfig", () => {
    it("updates config", () => {
      const service = new LocalAiServiceImpl();
      service.setConfig({ enabled: true, maxTokens: 1024 });
      const status = service.getStatus();
      expect(status.enabled).toBe(true);
    });

    it("preserves existing config", () => {
      const service = new LocalAiServiceImpl(undefined, { temperature: 0.5 });
      service.setConfig({ enabled: true });
      const status = service.getStatus();
      expect(status.enabled).toBe(true);
    });
  });

  describe("generateProjectDescription", () => {
    it("throws on empty projectName", async () => {
      const service = new LocalAiServiceImpl();
      await expect(service.generateProjectDescription(makeProjectInput({ projectName: "" })))
        .rejects.toThrow("projectName is required");
    });

    it("returns fallback when disabled", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generateProjectDescription(makeProjectInput());
      expect(result.title).toBe("TestProject");
      expect(result.description).toBe("A test project");
      expect(result.featureList).toEqual(["Auth", "Dashboard"]);
      expect(result.techSummary).toBe("React, TypeScript");
    });

    it("uses description fallback when no description", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generateProjectDescription(makeProjectInput({ description: null }));
      expect(result.description).toBe("TestProject is a software project");
    });

    it("uses default features when empty", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generateProjectDescription(makeProjectInput({ features: [] }));
      expect(result.featureList).toEqual(["Core functionality"]);
    });

    it("uses default tech when empty", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generateProjectDescription(makeProjectInput({ techStack: [] }));
      expect(result.techSummary).toBe("Software");
    });

    it("uses model when enabled", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("AI generated description\nFeature A\nFeature B"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const result = await service.generateProjectDescription(makeProjectInput());
      expect(result.description).toBe("AI generated description");
      expect(mockModel.infer).toHaveBeenCalledOnce();
    });

    it("caches results for same input", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("Cached result"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const input = makeProjectInput();
      await service.generateProjectDescription(input);
      await service.generateProjectDescription(input);
      expect(mockModel.infer).toHaveBeenCalledOnce();
    });

    it("does not cache when disabled", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const input = makeProjectInput();
      const r1 = await service.generateProjectDescription(input);
      const r2 = await service.generateProjectDescription(input);
      expect(r1).toEqual(r2);
    });

    it("falls back to heuristic on model error", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockRejectedValue(new Error("model failed")),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const result = await service.generateProjectDescription(makeProjectInput());
      expect(result.title).toBe("TestProject");
      expect(result.description).toBe("A test project");
    });
  });

  describe("generateScreenshotCaption", () => {
    it("throws on empty screenshotPath", async () => {
      const service = new LocalAiServiceImpl();
      await expect(service.generateScreenshotCaption(makeCaptionInput({ screenshotPath: "" })))
        .rejects.toThrow("screenshotPath is required");
    });

    it("returns fallback when disabled", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generateScreenshotCaption(makeCaptionInput());
      expect(result.caption).toBe("Screenshot of TestProject — Auth");
      expect(result.confidence).toBe(0.3);
    });

    it("uses feature context in fallback", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generateScreenshotCaption(makeCaptionInput({ featureContext: null }));
      expect(result.caption).toBe("Screenshot of TestProject — application");
    });

    it("uses model when enabled", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("AI caption for auth screen"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const result = await service.generateScreenshotCaption(makeCaptionInput());
      expect(result.caption).toBe("AI caption for auth screen");
      expect(result.confidence).toBe(0.7);
    });

    it("caches results", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("Cached caption"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const input = makeCaptionInput();
      await service.generateScreenshotCaption(input);
      await service.generateScreenshotCaption(input);
      expect(mockModel.infer).toHaveBeenCalledOnce();
    });

    it("falls back on model error", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockRejectedValue(new Error("fail")),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const result = await service.generateScreenshotCaption(makeCaptionInput());
      expect(result.caption).toBe("Screenshot of TestProject — Auth");
    });
  });

  describe("generatePortfolioSummary", () => {
    it("throws on empty projectName", async () => {
      const service = new LocalAiServiceImpl();
      await expect(service.generatePortfolioSummary(makeSummaryInput({ projectName: "" })))
        .rejects.toThrow("projectName is required");
    });

    it("returns fallback when disabled", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generatePortfolioSummary(makeSummaryInput());
      expect(result.summary).toContain("TestProject");
      expect(result.highlights).toContain("3 feature(s)");
      expect(result.highlights).toContain("5 recording(s)");
      expect(result.highlights).toContain("Built with React, TypeScript");
    });

    it("handles empty tech stack", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generatePortfolioSummary(makeSummaryInput({ techStack: [] }));
      expect(result.highlights).not.toContain(expect.stringMatching("Built with"));
    });

    it("handles zero counts", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generatePortfolioSummary(makeSummaryInput({ featureCount: 0, sessionCount: 0 }));
      expect(result.highlights).toEqual(["Built with React, TypeScript"]);
    });

    it("handles zero counts and empty tech", async () => {
      const service = new LocalAiServiceImpl(undefined, { enabled: false });
      const result = await service.generatePortfolioSummary(makeSummaryInput({ featureCount: 0, sessionCount: 0, techStack: [] }));
      expect(result.highlights).toEqual([]);
    });

    it("uses model when enabled", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("AI summary line\nHighlight 1\nHighlight 2"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const result = await service.generatePortfolioSummary(makeSummaryInput());
      expect(result.summary).toBe("AI summary line");
      expect(result.highlights).toEqual(["Highlight 1", "Highlight 2"]);
    });

    it("caches results", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("Cached summary"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const input = makeSummaryInput();
      await service.generatePortfolioSummary(input);
      await service.generatePortfolioSummary(input);
      expect(mockModel.infer).toHaveBeenCalledOnce();
    });

    it("falls back on model error", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockRejectedValue(new Error("fail")),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const result = await service.generatePortfolioSummary(makeSummaryInput());
      expect(result.summary).toContain("TestProject");
    });
  });

  describe("clearCache", () => {
    it("clears the cache", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("result"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      await service.generateProjectDescription(makeProjectInput());
      expect(service.getStatus().cacheSize).toBe(1);
      service.clearCache();
      expect(service.getStatus().cacheSize).toBe(0);
    });

    it("allows re-generation after clear", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("first").mockResolvedValueOnce("first").mockResolvedValueOnce("second"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      const input = makeProjectInput();
      await service.generateProjectDescription(input);
      service.clearCache();
      await service.generateProjectDescription(input);
      expect(mockModel.infer).toHaveBeenCalledTimes(2);
    });
  });

  describe("model integration", () => {
    it("passes context to model for description", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("Generated"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      await service.generateProjectDescription(makeProjectInput());
      const prompt = mockModel.infer.mock.calls[0][0] as string;
      expect(prompt).toContain("PROJECT: TestProject");
      expect(prompt).toContain("KEY: A test project");
      expect(prompt).toContain("KEY: Features: Auth, Dashboard");
    });

    it("passes context to model for caption", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("Caption"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      await service.generateScreenshotCaption(makeCaptionInput());
      const prompt = mockModel.infer.mock.calls[0][0] as string;
      expect(prompt).toContain("PROJECT: TestProject");
      expect(prompt).toContain("KEY: Feature: Auth");
    });

    it("passes context to model for summary", async () => {
      const mockModel: LocalModel = {
        infer: vi.fn().mockResolvedValue("Summary"),
      };
      const service = new LocalAiServiceImpl(mockModel, { enabled: true });
      await service.generatePortfolioSummary(makeSummaryInput());
      const prompt = mockModel.infer.mock.calls[0][0] as string;
      expect(prompt).toContain("PROJECT: TestProject");
      expect(prompt).toContain("KEY: 3 features, 5 recordings");
    });
  });
});
