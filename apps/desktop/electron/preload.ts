import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("portfolio", {
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    get: (id: string) => ipcRenderer.invoke("projects:get", id),
    create: (input: { name: string; path: string; executablePath?: string; launchCommand?: string; enabled?: boolean; autoRecord?: boolean }) =>
      ipcRenderer.invoke("projects:create", input),
    update: (id: string, input: { name?: string; path?: string; executablePath?: string | null; launchCommand?: string | null; enabled?: boolean; autoRecord?: boolean }) =>
      ipcRenderer.invoke("projects:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("projects:delete", id),
  },
  sessions: {
    start: (projectId: string, profileId?: string) => ipcRenderer.invoke("sessions:start", projectId, profileId),
    stop: (projectId: string) => ipcRenderer.invoke("sessions:stop", projectId),
    list: (projectId?: string) => ipcRenderer.invoke("sessions:list", projectId),
    get: (id: string) => ipcRenderer.invoke("sessions:get", id),
    create: (input: { projectId: string; trigger: string }) =>
      ipcRenderer.invoke("sessions:create", input),
    updateStatus: (id: string, status: string) =>
      ipcRenderer.invoke("sessions:updateStatus", id, status),
    updateRawVideoPath: (id: string, rawVideoPath: string) =>
      ipcRenderer.invoke("sessions:updateRawVideoPath", id, rawVideoPath),
    delete: (id: string) => ipcRenderer.invoke("sessions:delete", id),
    recordActivity: (projectId: string) => ipcRenderer.invoke("sessions:recordActivity", projectId),
  },
  assets: {
    listByProject: (projectId: string) => ipcRenderer.invoke("assets:listByProject", projectId),
    listBySession: (sessionId: string) => ipcRenderer.invoke("assets:listBySession", sessionId),
    listByType: (projectId: string, type: string) => ipcRenderer.invoke("assets:listByType", projectId, type),
    get: (id: string) => ipcRenderer.invoke("assets:get", id),
    create: (input: { sessionId: string; projectId: string; type: string; path: string; durationMs?: number; width?: number; height?: number; fileSizeBytes?: number }) =>
      ipcRenderer.invoke("assets:create", input),
    delete: (id: string) => ipcRenderer.invoke("assets:delete", id),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),
    delete: (key: string) => ipcRenderer.invoke("settings:delete", key),
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    get: (id: string) => ipcRenderer.invoke("profiles:get", id),
    create: (input: { name: string; description?: string; settings: Record<string, unknown>; presetName?: string }) =>
      ipcRenderer.invoke("profiles:create", input),
    update: (id: string, input: { name?: string; description?: string; settings?: Record<string, unknown> }) =>
      ipcRenderer.invoke("profiles:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("profiles:delete", id),
    getPreset: (presetName: string) => ipcRenderer.invoke("profiles:getPreset", presetName),
    getSettings: (id: string) => ipcRenderer.invoke("profiles:getSettings", id),
  },
  export: {
    project: (projectId: string) => ipcRenderer.invoke("export:project", projectId),
  },
  overrides: {
    get: (sessionId: string) => ipcRenderer.invoke("overrides:get", sessionId),
    save: (sessionId: string, overrides: { selectedIndices: number[]; removedIndices: number[]; thumbnailTimestampMs: number | null; highlightIndices: number[]; customOrder: number[] | null }) =>
      ipcRenderer.invoke("overrides:save", sessionId, overrides),
    clear: (sessionId: string) => ipcRenderer.invoke("overrides:clear", sessionId),
  },
  git: {
    repoInfo: (projectPath: string) => ipcRenderer.invoke("git:repoInfo", projectPath),
    projectFile: (projectPath: string) => ipcRenderer.invoke("git:projectFile", projectPath),
    metadata: (projectPath: string) => ipcRenderer.invoke("git:metadata", projectPath),
    log: (projectPath: string, maxCount?: number) => ipcRenderer.invoke("git:log", projectPath, maxCount),
  },
  scanner: {
    scan: (projectPath: string) => ipcRenderer.invoke("scanner:scan", projectPath),
  },
  featureEvidence: {
    generate: (projectId: string) => ipcRenderer.invoke("feature-evidence:generate", projectId),
    list: (projectId: string) => ipcRenderer.invoke("feature-evidence:list", projectId),
    get: (id: string) => ipcRenderer.invoke("feature-evidence:get", id),
    save: (input: { projectId: string; featureName: string; description?: string; confidence?: number; commits?: Array<{ sha: string; message: string; date: string }>; screenshotPaths?: string[]; recordingSegmentPaths?: string[]; readmeSnippet?: string | null }) =>
      ipcRenderer.invoke("feature-evidence:save", input),
    update: (id: string, input: { featureName?: string; description?: string | null; confidence?: number; status?: string }) =>
      ipcRenderer.invoke("feature-evidence:update", id, input),
    accept: (id: string) => ipcRenderer.invoke("feature-evidence:accept", id),
    reject: (id: string) => ipcRenderer.invoke("feature-evidence:reject", id),
    delete: (id: string) => ipcRenderer.invoke("feature-evidence:delete", id),
  },
  ai: {
    status: () => ipcRenderer.invoke("ai:status"),
    setConfig: (config: { enabled?: boolean; modelPath?: string | null; maxTokens?: number; temperature?: number }) =>
      ipcRenderer.invoke("ai:setConfig", config),
    generateDescription: (input: { projectName: string; description: string | null; features: string[]; techStack: string[]; gitBranch: string | null; gitCommitMessage: string | null; readmeContent: string | null; screenshotPaths: string[]; featureNames: string[] }) =>
      ipcRenderer.invoke("ai:generateDescription", input),
    generateScreenshotCaption: (input: { screenshotPath: string; projectName: string; featureContext: string | null; timestampMs: number }) =>
      ipcRenderer.invoke("ai:generateScreenshotCaption", input),
    generatePortfolioSummary: (input: { projectName: string; description: string | null; featureCount: number; sessionCount: number; techStack: string[] }) =>
      ipcRenderer.invoke("ai:generatePortfolioSummary", input),
    clearCache: () => ipcRenderer.invoke("ai:clearCache"),
  },
  portfolio: {
    generate: (config?: { outputDir?: string; includeScreenshots?: boolean; includeDemos?: boolean; theme?: string; customColors?: Record<string, string> }) =>
      ipcRenderer.invoke("portfolio:generate", config),
    data: () => ipcRenderer.invoke("portfolio:data"),
    outputDir: () => ipcRenderer.invoke("portfolio:outputDir"),
  },
  themes: {
    list: () => ipcRenderer.invoke("themes:list"),
    getActive: () => ipcRenderer.invoke("themes:getActive"),
    setActive: (name: string) => ipcRenderer.invoke("themes:setActive", name),
    getCustomColors: () => ipcRenderer.invoke("themes:getCustomColors"),
    setCustomColors: (colors: Record<string, string>) => ipcRenderer.invoke("themes:setCustomColors", colors),
  },
  deploy: {
    zip: (portfolioDir: string, outputPath?: string) => ipcRenderer.invoke("deploy:zip", portfolioDir, outputPath),
    preview: (portfolioDir: string) => ipcRenderer.invoke("deploy:preview", portfolioDir),
    run: (config: { target: string; portfolioDir: string; outputDir?: string; siteName?: string }) => ipcRenderer.invoke("deploy:run", config),
    targets: () => ipcRenderer.invoke("deploy:targets"),
  },
  devserver: {
    status: () => ipcRenderer.invoke("devserver:status"),
    start: () => ipcRenderer.invoke("devserver:start"),
    stop: () => ipcRenderer.invoke("devserver:stop"),
  },
  windows: {
    list: () => ipcRenderer.invoke("windows:list"),
  },
  chapters: {
    generate: (videoPath: string, sessionId: string, featureEvidence: Array<{ id: string; projectId: string; featureName: string; description: string | null; confidence: number; status: string; commits: Array<{ sha: string; message: string; date: string }>; screenshotPaths: string[]; recordingSegmentPaths: string[]; readmeSnippet: string | null; createdAt: string; updatedAt: string }>, config?: { minChapterDurationMs?: number; mergeGapMs?: number; titleSource?: string }) =>
      ipcRenderer.invoke("chapters:generate", videoPath, sessionId, featureEvidence, config),
    get: (sessionId: string) => ipcRenderer.invoke("chapters:get", sessionId),
    save: (sessionId: string, chapterList: { sessionId: string; chapters: Array<{ index: number; title: string; startMs: number; endMs: number | null; featureName: string | null; sceneScore: number }>; totalDurationMs: number; generatedAt: string }) =>
      ipcRenderer.invoke("chapters:save", sessionId, chapterList),
    rename: (sessionId: string, chapterIndex: number, newTitle: string) =>
      ipcRenderer.invoke("chapters:rename", sessionId, chapterIndex, newTitle),
    reorder: (sessionId: string, newOrder: number[]) =>
      ipcRenderer.invoke("chapters:reorder", sessionId, newOrder),
    delete: (sessionId: string) => ipcRenderer.invoke("chapters:delete", sessionId),
  },
  quality: {
    score: (input: { videoDurationMs: number; idleTimeMs: number; screenshotCount: number; featureCount: number; fps: number }, config?: { weights?: { visualClarity?: number; featureCoverage?: number; deadTimeRatio?: number; durationScore?: number; screenshotQuality?: number }; idealDurationMs?: number; durationToleranceMs?: number }) =>
      ipcRenderer.invoke("quality:score", input, config),
  },
});
