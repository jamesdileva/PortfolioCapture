import { ipcMain } from "electron";
import type { ExportServiceImpl } from "../services/export-service.js";

export function registerExportHandlers(exportService: ExportServiceImpl): void {
  ipcMain.handle("export:project", async (_event, projectId: string) => {
    return exportService.exportProject(projectId);
  });
}
