import { ipcMain } from "electron";
import type { PortfolioGeneratorImpl } from "../services/portfolio-generator.js";
import type { PortfolioGenerateConfig } from "../../../../packages/shared/types/index.js";

export function registerPortfolioHandlers(generator: PortfolioGeneratorImpl): void {
  ipcMain.handle("portfolio:generate", async (_event, config?: PortfolioGenerateConfig) => {
    return generator.generate(config);
  });

  ipcMain.handle("portfolio:data", async () => {
    return generator.getData();
  });
}
