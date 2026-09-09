import { ipcMain } from "electron";
import type { DemoQualityScorerImpl } from "../services/demo-quality-scorer.js";
import { DemoQualityScoreInputSchema, DemoQualityScorerConfigSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerDemoQualityHandlers(scorer: DemoQualityScorerImpl): void {
  ipcMain.handle("quality:score", (_event, input: unknown, config?: unknown) => {
    const validatedInput = validateInput(DemoQualityScoreInputSchema, input);
    const validatedConfig = config ? validateInput(DemoQualityScorerConfigSchema, config) : undefined;
    return scorer.score(validatedInput, validatedConfig);
  });
}
