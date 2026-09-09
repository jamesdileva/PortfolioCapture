import { ipcMain } from "electron";
import type { LocalAiServiceImpl } from "../services/local-ai-service.js";
import { ProjectAiInputSchema, ScreenshotCaptionInputSchema, PortfolioSummaryInputSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerAiHandlers(service: LocalAiServiceImpl): void {
  ipcMain.handle("ai:status", async () => {
    return service.getStatus();
  });

  ipcMain.handle("ai:setConfig", async (_event, config: unknown) => {
    service.setConfig(config as Parameters<LocalAiServiceImpl["setConfig"]>[0]);
  });

  ipcMain.handle("ai:generateDescription", async (_event, input: unknown) => {
    const validated = validateInput(ProjectAiInputSchema, input);
    return service.generateProjectDescription(validated);
  });

  ipcMain.handle("ai:generateScreenshotCaption", async (_event, input: unknown) => {
    const validated = validateInput(ScreenshotCaptionInputSchema, input);
    return service.generateScreenshotCaption(validated);
  });

  ipcMain.handle("ai:generatePortfolioSummary", async (_event, input: unknown) => {
    const validated = validateInput(PortfolioSummaryInputSchema, input);
    return service.generatePortfolioSummary(validated);
  });

  ipcMain.handle("ai:clearCache", async () => {
    service.clearCache();
  });
}
