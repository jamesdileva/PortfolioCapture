import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("portfolio", {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (input: unknown) => ipcRenderer.invoke("projects:create", input),
    update: (id: string, input: unknown) =>
      ipcRenderer.invoke("projects:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("projects:delete", id),
  },
  sessions: {
    start: (projectId: string) =>
      ipcRenderer.invoke("sessions:start", projectId),
    stop: (sessionId: string) =>
      ipcRenderer.invoke("sessions:stop", sessionId),
    list: (projectId?: string) =>
      ipcRenderer.invoke("sessions:list", projectId),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (input: unknown) => ipcRenderer.invoke("settings:update", input),
  },
});
