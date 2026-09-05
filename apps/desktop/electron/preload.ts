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
  },
});
