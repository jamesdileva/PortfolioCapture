import { describe, it, expect } from "vitest";
import {
  validateInput,
  ValidationError,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  CreateSessionInputSchema,
  CreateAssetInputSchema,
  CreateProfileInputSchema,
  UpdateProfileInputSchema,
  TimelineOverridesSchema,
  FeatureEvidenceInputSchema,
  FeatureEvidenceUpdateInputSchema,
  FeatureChapterListSchema,
  DeployConfigSchema,
  PortfolioGenerateConfigSchema,
  ThemeColorConfigSchema,
  ProjectAiInputSchema,
  ScreenshotCaptionInputSchema,
  PortfolioSummaryInputSchema,
  DemoQualityScoreInputSchema,
} from "../../packages/shared/schemas/index.js";

describe("validateInput", () => {
  it("returns parsed data on valid input", () => {
    const result = validateInput(CreateProjectInputSchema, { name: "Test", path: "/foo" });
    expect(result.name).toBe("Test");
    expect(result.path).toBe("/foo");
  });

  it("throws ValidationError on invalid input", () => {
    expect(() => validateInput(CreateProjectInputSchema, {})).toThrow(ValidationError);
  });

  it("includes field errors in ValidationError", () => {
    try {
      validateInput(CreateProjectInputSchema, {});
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const err = e as ValidationError;
      expect(err.fieldErrors["name"]).toBeDefined();
      expect(err.fieldErrors["path"]).toBeDefined();
    }
  });
});

describe("CreateProjectInputSchema", () => {
  it("accepts minimal valid input", () => {
    const result = validateInput(CreateProjectInputSchema, { name: "My Project", path: "/src" });
    expect(result.name).toBe("My Project");
  });

  it("accepts all optional fields", () => {
    const result = validateInput(CreateProjectInputSchema, {
      name: "P",
      path: "/p",
      executablePath: "node.exe",
      launchCommand: "npm start",
      enabled: false,
      autoRecord: true,
      description: "desc",
      features: ["feat1"],
      techStack: ["React"],
      githubUrl: "https://github.com/x/y",
      projectStatus: "active",
      devServerPorts: [3000, 5173],
    });
    expect(result.devServerPorts).toEqual([3000, 5173]);
  });

  it("rejects empty name", () => {
    expect(() => validateInput(CreateProjectInputSchema, { name: "", path: "/p" })).toThrow();
  });

  it("rejects empty path", () => {
    expect(() => validateInput(CreateProjectInputSchema, { name: "P", path: "" })).toThrow();
  });

  it("rejects negative devServerPorts", () => {
    expect(() =>
      validateInput(CreateProjectInputSchema, { name: "P", path: "/p", devServerPorts: [-1] })
    ).toThrow();
  });

  it("strips unknown fields", () => {
    const result = validateInput(CreateProjectInputSchema, { name: "P", path: "/p", unknown: true } as any);
    expect((result as any).unknown).toBeUndefined();
  });
});

describe("UpdateProjectInputSchema", () => {
  it("accepts empty object", () => {
    const result = validateInput(UpdateProjectInputSchema, {});
    expect(result).toEqual({});
  });

  it("accepts partial update", () => {
    const result = validateInput(UpdateProjectInputSchema, { name: "New" });
    expect(result.name).toBe("New");
  });

  it("accepts null nullable fields", () => {
    const result = validateInput(UpdateProjectInputSchema, { executablePath: null, launchCommand: null });
    expect(result.executablePath).toBeNull();
  });
});

describe("CreateSessionInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(CreateSessionInputSchema, { projectId: "abc", trigger: "manual" });
    expect(result.projectId).toBe("abc");
  });

  it("rejects invalid trigger", () => {
    expect(() => validateInput(CreateSessionInputSchema, { projectId: "abc", trigger: "bogus" })).toThrow();
  });

  it("rejects missing projectId", () => {
    expect(() => validateInput(CreateSessionInputSchema, { trigger: "manual" })).toThrow();
  });
});

describe("CreateAssetInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(CreateAssetInputSchema, {
      sessionId: "s1",
      projectId: "p1",
      type: "screenshot",
      path: "/img.png",
    });
    expect(result.type).toBe("screenshot");
  });

  it("rejects invalid type", () => {
    expect(() =>
      validateInput(CreateAssetInputSchema, { sessionId: "s1", projectId: "p1", type: "bogus", path: "/p" })
    ).toThrow();
  });

  it("rejects negative duration", () => {
    expect(() =>
      validateInput(CreateAssetInputSchema, {
        sessionId: "s1",
        projectId: "p1",
        type: "raw_video",
        path: "/v.mp4",
        durationMs: -1,
      })
    ).toThrow();
  });
});

describe("TimelineOverridesSchema", () => {
  it("accepts valid overrides", () => {
    const result = validateInput(TimelineOverridesSchema, {
      selectedIndices: [0, 2],
      removedIndices: [1],
      thumbnailTimestampMs: 5000,
      highlightIndices: [],
      customOrder: null,
    });
    expect(result.selectedIndices).toEqual([0, 2]);
    expect(result.customOrder).toBeNull();
  });

  it("rejects non-array selectedIndices", () => {
    expect(() =>
      validateInput(TimelineOverridesSchema, {
        selectedIndices: "not-array",
        removedIndices: [],
        thumbnailTimestampMs: null,
        highlightIndices: [],
        customOrder: null,
      })
    ).toThrow();
  });
});

describe("FeatureEvidenceInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(FeatureEvidenceInputSchema, {
      projectId: "p1",
      featureName: "Auth",
    });
    expect(result.featureName).toBe("Auth");
  });

  it("rejects empty featureName", () => {
    expect(() => validateInput(FeatureEvidenceInputSchema, { projectId: "p1", featureName: "" })).toThrow();
  });

  it("rejects confidence out of range", () => {
    expect(() =>
      validateInput(FeatureEvidenceInputSchema, { projectId: "p1", featureName: "F", confidence: 1.5 })
    ).toThrow();
  });
});

describe("DeployConfigSchema", () => {
  it("accepts valid config", () => {
    const result = validateInput(DeployConfigSchema, {
      target: "netlify",
      portfolioDir: "/dist",
    });
    expect(result.target).toBe("netlify");
  });

  it("rejects invalid target", () => {
    expect(() => validateInput(DeployConfigSchema, { target: "aws", portfolioDir: "/d" })).toThrow();
  });
});

describe("PortfolioGenerateConfigSchema", () => {
  it("accepts empty config", () => {
    const result = validateInput(PortfolioGenerateConfigSchema, {});
    expect(result).toEqual({});
  });

  it("accepts full config", () => {
    const result = validateInput(PortfolioGenerateConfigSchema, {
      outputDir: "/out",
      includeScreenshots: true,
      includeDemos: false,
      theme: "dark",
    });
    expect(result.theme).toBe("dark");
  });

  it("rejects invalid theme", () => {
    expect(() => validateInput(PortfolioGenerateConfigSchema, { theme: "neon" })).toThrow();
  });
});

describe("ThemeColorConfigSchema", () => {
  it("accepts valid colors", () => {
    const result = validateInput(ThemeColorConfigSchema, {
      background: "#000",
      surface: "#111",
      text: "#fff",
      textMuted: "#888",
      accent: "#0af",
      border: "#333",
      statusActive: "#0f0",
      statusCompleted: "#888",
      statusPaused: "#ff0",
    });
    expect(result.background).toBe("#000");
  });

  it("rejects missing required color", () => {
    expect(() => validateInput(ThemeColorConfigSchema, { background: "#000" })).toThrow();
  });
});

describe("ProjectAiInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(ProjectAiInputSchema, {
      projectName: "App",
      description: null,
      features: [],
      techStack: [],
      gitBranch: null,
      gitCommitMessage: null,
      readmeContent: null,
      screenshotPaths: [],
      featureNames: [],
    });
    expect(result.projectName).toBe("App");
  });

  it("rejects empty projectName", () => {
    expect(() =>
      validateInput(ProjectAiInputSchema, {
        projectName: "",
        description: null,
        features: [],
        techStack: [],
        gitBranch: null,
        gitCommitMessage: null,
        readmeContent: null,
        screenshotPaths: [],
        featureNames: [],
      })
    ).toThrow();
  });
});

describe("ScreenshotCaptionInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(ScreenshotCaptionInputSchema, {
      screenshotPath: "/shot.png",
      projectName: "App",
      featureContext: null,
      timestampMs: 1000,
    });
    expect(result.screenshotPath).toBe("/shot.png");
  });

  it("rejects empty screenshotPath", () => {
    expect(() =>
      validateInput(ScreenshotCaptionInputSchema, {
        screenshotPath: "",
        projectName: "App",
        featureContext: null,
        timestampMs: 0,
      })
    ).toThrow();
  });
});

describe("PortfolioSummaryInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(PortfolioSummaryInputSchema, {
      projectName: "App",
      description: null,
      featureCount: 5,
      sessionCount: 3,
      techStack: ["React"],
    });
    expect(result.featureCount).toBe(5);
  });

  it("rejects negative featureCount", () => {
    expect(() =>
      validateInput(PortfolioSummaryInputSchema, {
        projectName: "App",
        description: null,
        featureCount: -1,
        sessionCount: 0,
        techStack: [],
      })
    ).toThrow();
  });
});

describe("DemoQualityScoreInputSchema", () => {
  it("accepts valid input", () => {
    const result = validateInput(DemoQualityScoreInputSchema, {
      videoDurationMs: 60000,
      idleTimeMs: 5000,
      screenshotCount: 3,
      featureCount: 2,
      fps: 30,
    });
    expect(result.fps).toBe(30);
  });

  it("rejects zero fps", () => {
    expect(() =>
      validateInput(DemoQualityScoreInputSchema, {
        videoDurationMs: 60000,
        idleTimeMs: 0,
        screenshotCount: 0,
        featureCount: 0,
        fps: 0,
      })
    ).toThrow();
  });
});

describe("FeatureChapterListSchema", () => {
  it("accepts valid chapter list", () => {
    const result = validateInput(FeatureChapterListSchema, {
      sessionId: "s1",
      chapters: [
        { index: 0, title: "Intro", startMs: 0, endMs: 5000, featureName: null, sceneScore: 1.0 },
      ],
      totalDurationMs: 60000,
      generatedAt: "2026-01-01T00:00:00Z",
    });
    expect(result.chapters).toHaveLength(1);
  });

  it("rejects missing chapters array", () => {
    expect(() =>
      validateInput(FeatureChapterListSchema, {
        sessionId: "s1",
        totalDurationMs: 60000,
        generatedAt: "2026-01-01T00:00:00Z",
      })
    ).toThrow();
  });
});
