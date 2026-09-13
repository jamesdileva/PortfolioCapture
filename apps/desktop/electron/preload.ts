import { contextBridge, ipcRenderer } from "electron";

const IPC_TIMEOUT_MS = 30_000;

function invokeWithTimeout(channel: string, ...args: unknown[]): Promise<unknown> {
  return Promise.race([
    ipcRenderer.invoke(channel, ...args),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`IPC call "${channel}" timed out after ${IPC_TIMEOUT_MS}ms`)), IPC_TIMEOUT_MS),
    ),
  ]);
}

contextBridge.exposeInMainWorld("portfolio", {
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  projects: {
    list: () => invokeWithTimeout("projects:list"),
    get: (id: string) => invokeWithTimeout("projects:get", id),
    create: (input: { name: string; path: string; executablePath?: string; launchCommand?: string; enabled?: boolean; autoRecord?: boolean; description?: string; features?: string[]; techStack?: string[]; githubUrl?: string; projectStatus?: string; devServerPorts?: number[]; captureMode?: string; windowTitle?: string }) =>
      invokeWithTimeout("projects:create", input),
    update: (id: string, input: { name?: string; path?: string; executablePath?: string | null; launchCommand?: string | null; enabled?: boolean; autoRecord?: boolean; description?: string | null; features?: string[]; techStack?: string[]; githubUrl?: string | null; projectStatus?: string; devServerPorts?: number[]; captureMode?: string; windowTitle?: string | null }) =>
      invokeWithTimeout("projects:update", id, input),
    delete: (id: string) => invokeWithTimeout("projects:delete", id),
  },
  sessions: {
    start: (projectId: string, profileId?: string) => invokeWithTimeout("sessions:start", projectId, profileId),
    stop: (projectId: string) => invokeWithTimeout("sessions:stop", projectId),
    list: (projectId?: string) => invokeWithTimeout("sessions:list", projectId),
    get: (id: string) => invokeWithTimeout("sessions:get", id),
    create: (input: { projectId: string; trigger: string }) =>
      invokeWithTimeout("sessions:create", input),
    updateStatus: (id: string, status: string) =>
      invokeWithTimeout("sessions:updateStatus", id, status),
    updateRawVideoPath: (id: string, rawVideoPath: string) =>
      invokeWithTimeout("sessions:updateRawVideoPath", id, rawVideoPath),
    delete: (id: string) => invokeWithTimeout("sessions:delete", id),
    recordActivity: (projectId: string) => invokeWithTimeout("sessions:recordActivity", projectId),
  },
  assets: {
    listByProject: (projectId: string) => invokeWithTimeout("assets:listByProject", projectId),
    listBySession: (sessionId: string) => invokeWithTimeout("assets:listBySession", sessionId),
    listByType: (projectId: string, type: string) => invokeWithTimeout("assets:listByType", projectId, type),
    get: (id: string) => invokeWithTimeout("assets:get", id),
    create: (input: { sessionId: string; projectId: string; type: string; path: string; durationMs?: number; width?: number; height?: number; fileSizeBytes?: number }) =>
      invokeWithTimeout("assets:create", input),
    delete: (id: string) => invokeWithTimeout("assets:delete", id),
  },
  settings: {
    get: () => invokeWithTimeout("settings:get"),
    set: (key: string, value: string) => invokeWithTimeout("settings:set", key, value),
    delete: (key: string) => invokeWithTimeout("settings:delete", key),
  },
  profiles: {
    list: () => invokeWithTimeout("profiles:list"),
    get: (id: string) => invokeWithTimeout("profiles:get", id),
    create: (input: { name: string; description?: string; settings: Record<string, unknown>; presetName?: string }) =>
      invokeWithTimeout("profiles:create", input),
    update: (id: string, input: { name?: string; description?: string; settings?: Record<string, unknown> }) =>
      invokeWithTimeout("profiles:update", id, input),
    delete: (id: string) => invokeWithTimeout("profiles:delete", id),
    getPreset: (presetName: string) => invokeWithTimeout("profiles:getPreset", presetName),
    getSettings: (id: string) => invokeWithTimeout("profiles:getSettings", id),
  },
  export: {
    project: (projectId: string) => invokeWithTimeout("export:project", projectId),
  },
  overrides: {
    get: (sessionId: string) => invokeWithTimeout("overrides:get", sessionId),
    save: (sessionId: string, overrides: { selectedIndices: number[]; removedIndices: number[]; thumbnailTimestampMs: number | null; highlightIndices: number[]; customOrder: number[] | null }) =>
      invokeWithTimeout("overrides:save", sessionId, overrides),
    clear: (sessionId: string) => invokeWithTimeout("overrides:clear", sessionId),
  },
  git: {
    repoInfo: (projectPath: string) => invokeWithTimeout("git:repoInfo", projectPath),
    projectFile: (projectPath: string) => invokeWithTimeout("git:projectFile", projectPath),
    metadata: (projectPath: string) => invokeWithTimeout("git:metadata", projectPath),
    log: (projectPath: string, maxCount?: number) => invokeWithTimeout("git:log", projectPath, maxCount),
  },
  scanner: {
    scan: (projectPath: string) => invokeWithTimeout("scanner:scan", projectPath),
    autofill: (projectPath: string) => invokeWithTimeout("scanner:autofill", projectPath),
  },
  featureEvidence: {
    generate: (projectId: string) => invokeWithTimeout("feature-evidence:generate", projectId),
    list: (projectId: string) => invokeWithTimeout("feature-evidence:list", projectId),
    get: (id: string) => invokeWithTimeout("feature-evidence:get", id),
    save: (input: { projectId: string; featureName: string; description?: string; confidence?: number; commits?: Array<{ sha: string; message: string; date: string }>; screenshotPaths?: string[]; recordingSegmentPaths?: string[]; readmeSnippet?: string | null }) =>
      invokeWithTimeout("feature-evidence:save", input),
    update: (id: string, input: { featureName?: string; description?: string | null; confidence?: number; status?: string }) =>
      invokeWithTimeout("feature-evidence:update", id, input),
    accept: (id: string) => invokeWithTimeout("feature-evidence:accept", id),
    reject: (id: string) => invokeWithTimeout("feature-evidence:reject", id),
    delete: (id: string) => invokeWithTimeout("feature-evidence:delete", id),
  },
  ai: {
    status: () => invokeWithTimeout("ai:status"),
    setConfig: (config: { enabled?: boolean; modelPath?: string | null; maxTokens?: number; temperature?: number }) =>
      invokeWithTimeout("ai:setConfig", config),
    generateDescription: (input: { projectName: string; description: string | null; features: string[]; techStack: string[]; gitBranch: string | null; gitCommitMessage: string | null; readmeContent: string | null; screenshotPaths: string[]; featureNames: string[] }) =>
      invokeWithTimeout("ai:generateDescription", input),
    generateScreenshotCaption: (input: { screenshotPath: string; projectName: string; featureContext: string | null; timestampMs: number }) =>
      invokeWithTimeout("ai:generateScreenshotCaption", input),
    generatePortfolioSummary: (input: { projectName: string; description: string | null; featureCount: number; sessionCount: number; techStack: string[] }) =>
      invokeWithTimeout("ai:generatePortfolioSummary", input),
    clearCache: () => invokeWithTimeout("ai:clearCache"),
  },
  portfolio: {
    generate: (config?: { outputDir?: string; includeScreenshots?: boolean; includeDemos?: boolean; theme?: string; customColors?: Record<string, string> }) =>
      invokeWithTimeout("portfolio:generate", config),
    data: () => invokeWithTimeout("portfolio:data"),
    outputDir: () => invokeWithTimeout("portfolio:outputDir"),
  },
  themes: {
    list: () => invokeWithTimeout("themes:list"),
    getActive: () => invokeWithTimeout("themes:getActive"),
    setActive: (name: string) => invokeWithTimeout("themes:setActive", name),
    getCustomColors: () => invokeWithTimeout("themes:getCustomColors"),
    setCustomColors: (colors: Record<string, string>) => invokeWithTimeout("themes:setCustomColors", colors),
  },
  deploy: {
    zip: (portfolioDir: string, outputPath?: string) => invokeWithTimeout("deploy:zip", portfolioDir, outputPath),
    preview: (portfolioDir: string) => invokeWithTimeout("deploy:preview", portfolioDir),
    run: (config: { target: string; portfolioDir: string; outputDir?: string; siteName?: string }) => invokeWithTimeout("deploy:run", config),
    targets: () => invokeWithTimeout("deploy:targets"),
  },
  devserver: {
    status: () => invokeWithTimeout("devserver:status"),
    start: () => invokeWithTimeout("devserver:start"),
    stop: () => invokeWithTimeout("devserver:stop"),
  },
  windows: {
    list: () => invokeWithTimeout("windows:list"),
  },
  chapters: {
    generate: (videoPath: string, sessionId: string, featureEvidence: Array<{ id: string; projectId: string; featureName: string; description: string | null; confidence: number; status: string; commits: Array<{ sha: string; message: string; date: string }>; screenshotPaths: string[]; recordingSegmentPaths: string[]; readmeSnippet: string | null; createdAt: string; updatedAt: string }>, config?: { minChapterDurationMs?: number; mergeGapMs?: number; titleSource?: string }) =>
      invokeWithTimeout("chapters:generate", videoPath, sessionId, featureEvidence, config),
    get: (sessionId: string) => invokeWithTimeout("chapters:get", sessionId),
    save: (sessionId: string, chapterList: { sessionId: string; chapters: Array<{ index: number; title: string; startMs: number; endMs: number | null; featureName: string | null; sceneScore: number }>; totalDurationMs: number; generatedAt: string }) =>
      invokeWithTimeout("chapters:save", sessionId, chapterList),
    rename: (sessionId: string, chapterIndex: number, newTitle: string) =>
      invokeWithTimeout("chapters:rename", sessionId, chapterIndex, newTitle),
    reorder: (sessionId: string, newOrder: number[]) =>
      invokeWithTimeout("chapters:reorder", sessionId, newOrder),
    delete: (sessionId: string) => invokeWithTimeout("chapters:delete", sessionId),
  },
  quality: {
    score: (input: { videoDurationMs: number; idleTimeMs: number; screenshotCount: number; featureCount: number; fps: number }, config?: { weights?: { visualClarity?: number; featureCoverage?: number; deadTimeRatio?: number; durationScore?: number; screenshotQuality?: number }; idealDurationMs?: number; durationToleranceMs?: number }) =>
      invokeWithTimeout("quality:score", input, config),
  },
  crashRecovery: {
    detect: () => invokeWithTimeout("crash-recovery:detect"),
    discard: (sessionId: string) => invokeWithTimeout("crash-recovery:discard", sessionId),
    autoCleanup: () => invokeWithTimeout("crash-recovery:autoCleanup"),
  },
  health: {
    check: () => invokeWithTimeout("health:check"),
  },
});
