import { ipcMain } from "electron";
import type { DemoQualityScorerImpl } from "../services/demo-quality-scorer.js";
import type { DemoQualityScorerConfig } from "../../../../packages/shared/types/index.js";

export function registerDemoQualityHandlers(scorer: DemoQualityScorerImpl): void {
  ipcMain.handle("quality:score", (_event, input: {
    videoDurationMs: number;
    idleTimeMs: number;
    screenshotCount: number;
    featureCount: number;
    fps: number;
  }, config?: Partial<DemoQualityScorerConfig>) => {
    return scorer.score(input, config);
  });
}
