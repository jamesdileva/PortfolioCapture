import { ipcMain } from "electron";
import type { ProjectScannerImpl } from "../services/project-scanner.js";
import type { ProjectAutoFillServiceImpl } from "../services/project-autofill.js";

export function registerScannerHandlers(
  scanner: ProjectScannerImpl,
  autoFill?: ProjectAutoFillServiceImpl,
): void {
  ipcMain.handle("scanner:scan", async (_event, projectPath: string) => {
    return scanner.scan(projectPath);
  });

  if (autoFill) {
    ipcMain.handle("scanner:autofill", async (_event, projectPath: string) => {
      return autoFill.detect(projectPath);
    });
  }
}
