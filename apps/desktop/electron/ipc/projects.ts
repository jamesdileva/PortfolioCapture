import { ipcMain } from "electron";
import type { ProjectService } from "../services/project-service.js";
import { CreateProjectInputSchema, UpdateProjectInputSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerProjectHandlers(
  projectService: ProjectService,
  onProjectsChanged?: () => void,
  onProjectsDeleted?: () => void,
): void {
  const notifyChanged = () => {
    try {
      onProjectsChanged?.();
    } catch {
      // Monitor refresh is best-effort — never fail the CRUD operation.
    }
  };

  const notifyDeleted = () => {
    try {
      onProjectsDeleted?.();
    } catch {
      // Portfolio refresh is best-effort — never fail the CRUD operation.
    }
  };

  ipcMain.handle("projects:list", () => {
    return projectService.list();
  });

  ipcMain.handle("projects:get", (_event, id: string) => {
    return projectService.getById(id);
  });

  ipcMain.handle("projects:create", (_event, input) => {
    const validated = validateInput(CreateProjectInputSchema, input);
    const created = projectService.create(validated);
    notifyChanged();
    return created;
  });

  ipcMain.handle("projects:update", (_event, id: string, input) => {
    const validated = validateInput(UpdateProjectInputSchema, input);
    const updated = projectService.update(id, validated);
    notifyChanged();
    return updated;
  });

  ipcMain.handle("projects:delete", (_event, id: string) => {
    const result = projectService.delete(id);
    notifyChanged();
    notifyDeleted();
    return result;
  });
}
