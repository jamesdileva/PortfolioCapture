import { ipcMain } from "electron";
import type { PortfolioGeneratorImpl } from "../services/portfolio-generator.js";
import type { PortfolioGenerateConfig } from "../../../../packages/shared/types/index.js";

export function registerPortfolioHandlers(generator: PortfolioGeneratorImpl, outputDir: string): void {
  ipcMain.handle("portfolio:generate", async (_event, config?: PortfolioGenerateConfig) => {
    return generator.generate(config);
  });

  ipcMain.handle("portfolio:data", async () => {
    return generator.getData();
  });

  ipcMain.handle("portfolio:outputDir", async () => {
    return outputDir;
  });
}
