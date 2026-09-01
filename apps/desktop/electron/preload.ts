import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("portfolio", {
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
    list: (projectId?: string) => ipcRenderer.invoke("sessions:list", projectId),
    get: (id: string) => ipcRenderer.invoke("sessions:get", id),
    create: (input: { projectId: string; trigger: string }) =>
      ipcRenderer.invoke("sessions:create", input),
    updateStatus: (id: string, status: string) =>
      ipcRenderer.invoke("sessions:updateStatus", id, status),
    updateRawVideoPath: (id: string, rawVideoPath: string) =>
      ipcRenderer.invoke("sessions:updateRawVideoPath", id, rawVideoPath),
    delete: (id: string) => ipcRenderer.invoke("sessions:delete", id),
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
});
