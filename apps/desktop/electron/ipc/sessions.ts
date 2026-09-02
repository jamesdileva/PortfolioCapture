import { ipcMain } from "electron";
import type { SessionService } from "../services/session-service.js";
import type { SessionManager } from "../services/session-manager.js";

export function registerSessionHandlers(sessionService: SessionService, sessionManager: SessionManager): void {
  ipcMain.handle("sessions:start", async (_event, projectId: string) => {
    return sessionManager.startSession(projectId, "manual");
  });

  ipcMain.handle("sessions:stop", async (_event, projectId: string) => {
    return sessionManager.stopSession(projectId);
  });

  ipcMain.handle("sessions:list", (_event, projectId?: string) => {
    if (projectId) {
      return sessionService.listByProject(projectId);
    }
    return sessionService.listAll();
  });

  ipcMain.handle("sessions:create", (_event, input) => {
    return sessionService.create(input);
  });

  ipcMain.handle("sessions:get", (_event, id: string) => {
    return sessionService.getById(id);
  });

  ipcMain.handle("sessions:updateStatus", (_event, id: string, status: string) => {
    return sessionService.updateStatus(id, status as Parameters<SessionService["updateStatus"]>[1]);
  });

  ipcMain.handle("sessions:updateRawVideoPath", (_event, id: string, rawVideoPath: string) => {
    return sessionService.updateRawVideoPath(id, rawVideoPath);
  });

  ipcMain.handle("sessions:delete", (_event, id: string) => {
    return sessionService.delete(id);
  });

  ipcMain.handle("sessions:recordActivity", (_event, projectId: string) => {
    sessionManager.recordActivity(projectId);
  });
}
