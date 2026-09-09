import { ipcMain } from "electron";
import type { PortfolioGeneratorImpl } from "../services/portfolio-generator.js";
import { PortfolioGenerateConfigSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerPortfolioHandlers(generator: PortfolioGeneratorImpl, outputDir: string): void {
  ipcMain.handle("portfolio:generate", async (_event, config?: unknown) => {
    const validated = config ? validateInput(PortfolioGenerateConfigSchema, config) : undefined;
    return generator.generate(validated);
  });

  ipcMain.handle("portfolio:data", async () => {
    return generator.getData();
  });

  ipcMain.handle("portfolio:outputDir", async () => {
    return outputDir;
  });
}
