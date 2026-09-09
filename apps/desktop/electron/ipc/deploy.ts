import { ipcMain } from "electron";
import type { DeployServiceImpl } from "../services/deploy-service.js";
import { ZipExportConfigSchema, DeployConfigSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerDeployHandlers(deployService: DeployServiceImpl): void {
  ipcMain.handle("deploy:zip", async (_event, portfolioDir: string, outputPath?: string) => {
    return deployService.zipExport({ portfolioDir, outputPath });
  });

  ipcMain.handle("deploy:preview", async (_event, portfolioDir: string) => {
    await deployService.previewLocal(portfolioDir);
    return { success: true };
  });

  ipcMain.handle("deploy:run", async (_event, config: unknown) => {
    const validated = validateInput(DeployConfigSchema, config);
    return deployService.deploy(validated);
  });

  ipcMain.handle("deploy:targets", async () => {
    return deployService.getSupportedTargets();
  });
}
