import { ipcMain } from "electron";
import type { CrashRecoveryServiceImpl } from "../services/crash-recovery.js";
import type { ProjectService } from "../services/project-service.js";

export function registerCrashRecoveryHandlers(
  crashRecovery: CrashRecoveryServiceImpl,
  projectService: ProjectService,
): void {
  ipcMain.handle("crash-recovery:detect", () => {
    const projects = projectService.list();
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    return crashRecovery.detectOrphans(projectNames);
  });

  ipcMain.handle("crash-recovery:discard", (_event, sessionId: string) => {
    crashRecovery.discardOrphan(sessionId);
  });

  ipcMain.handle("crash-recovery:autoCleanup", () => {
    const projects = projectService.list();
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    return crashRecovery.autoCleanup(projectNames);
  });
}
