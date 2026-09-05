import { ipcMain } from "electron";
import type { ProjectScannerImpl } from "../services/project-scanner.js";

export function registerScannerHandlers(scanner: ProjectScannerImpl): void {
  ipcMain.handle("scanner:scan", async (_event, projectPath: string) => {
    return scanner.scan(projectPath);
  });
}
