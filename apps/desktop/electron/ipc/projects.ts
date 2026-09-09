import { ipcMain } from "electron";
import type { ProjectService } from "../services/project-service.js";
import { CreateProjectInputSchema, UpdateProjectInputSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerProjectHandlers(projectService: ProjectService): void {
  ipcMain.handle("projects:list", () => {
    return projectService.list();
  });

  ipcMain.handle("projects:get", (_event, id: string) => {
    return projectService.getById(id);
  });

  ipcMain.handle("projects:create", (_event, input) => {
    const validated = validateInput(CreateProjectInputSchema, input);
    return projectService.create(validated);
  });

  ipcMain.handle("projects:update", (_event, id: string, input) => {
    const validated = validateInput(UpdateProjectInputSchema, input);
    return projectService.update(id, validated);
  });

  ipcMain.handle("projects:delete", (_event, id: string) => {
    return projectService.delete(id);
  });
}
