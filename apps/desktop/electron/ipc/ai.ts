import { ipcMain } from "electron";
import type { LocalAiServiceImpl } from "../services/local-ai-service.js";
import type { ProjectAiInput, ScreenshotCaptionInput, PortfolioSummaryInput } from "../../../../packages/shared/types/index.js";

export function registerAiHandlers(service: LocalAiServiceImpl): void {
  ipcMain.handle("ai:status", async () => {
    return service.getStatus();
  });

  ipcMain.handle("ai:setConfig", async (_event, config: Partial<{ enabled: boolean; modelPath: string | null; maxTokens: number; temperature: number }>) => {
    service.setConfig(config);
  });

  ipcMain.handle("ai:generateDescription", async (_event, input: ProjectAiInput) => {
    return service.generateProjectDescription(input);
  });

  ipcMain.handle("ai:generateScreenshotCaption", async (_event, input: ScreenshotCaptionInput) => {
    return service.generateScreenshotCaption(input);
  });

  ipcMain.handle("ai:generatePortfolioSummary", async (_event, input: PortfolioSummaryInput) => {
    return service.generatePortfolioSummary(input);
  });

  ipcMain.handle("ai:clearCache", async () => {
    service.clearCache();
  });
}
