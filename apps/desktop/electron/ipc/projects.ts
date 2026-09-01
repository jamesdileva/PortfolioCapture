import { ipcMain } from "electron";
import type { ProjectService } from "../services/project-service.js";

export function registerProjectHandlers(projectService: ProjectService): void {
  ipcMain.handle("projects:list", () => {
    return projectService.list();
  });

  ipcMain.handle("projects:get", (_event, id: string) => {
    return projectService.getById(id);
  });

  ipcMain.handle("projects:create", (_event, input) => {
    return projectService.create(input);
  });

  ipcMain.handle("projects:update", (_event, id: string, input) => {
    return projectService.update(id, input);
  });

  ipcMain.handle("projects:delete", (_event, id: string) => {
    return projectService.delete(id);
  });
}
