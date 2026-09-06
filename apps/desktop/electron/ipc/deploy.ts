import { ipcMain } from "electron";
import type { DeployServiceImpl } from "../services/deploy-service.js";

const VALID_TARGETS = ["zip", "github-pages", "netlify", "vercel"] as const;

export function registerDeployHandlers(deployService: DeployServiceImpl): void {
  ipcMain.handle("deploy:zip", async (_event, portfolioDir: string, outputPath?: string) => {
    return deployService.zipExport({ portfolioDir, outputPath });
  });

  ipcMain.handle("deploy:preview", async (_event, portfolioDir: string) => {
    await deployService.previewLocal(portfolioDir);
    return { success: true };
  });

  ipcMain.handle("deploy:run", async (_event, config: { target: string; portfolioDir: string; outputDir?: string; siteName?: string }) => {
    if (!VALID_TARGETS.includes(config.target as typeof VALID_TARGETS[number])) {
      throw new Error(`Invalid deploy target: ${config.target}. Must be one of: ${VALID_TARGETS.join(", ")}`);
    }
    return deployService.deploy(config as Parameters<DeployServiceImpl["deploy"]>[0]);
  });

  ipcMain.handle("deploy:targets", async () => {
    return deployService.getSupportedTargets();
  });
}
