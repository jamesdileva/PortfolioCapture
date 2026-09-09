import { ipcMain } from "electron";
import type { FeatureChapterGeneratorImpl } from "../services/feature-chapter-generator.js";
import type { FeatureEvidence } from "../../../../packages/shared/types/index.js";
import { FeatureChapterListSchema, FeatureChapterGeneratorConfigSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerChapterHandlers(chapterGenerator: FeatureChapterGeneratorImpl): void {
  ipcMain.handle("chapters:generate", async (_event, videoPath: string, sessionId: string, featureEvidence: FeatureEvidence[], config?: unknown) => {
    const validatedConfig = config ? validateInput(FeatureChapterGeneratorConfigSchema.partial(), config) : undefined;
    return chapterGenerator.generateChapters(videoPath, sessionId, featureEvidence, validatedConfig);
  });

  ipcMain.handle("chapters:get", (_event, sessionId: string) => {
    return chapterGenerator.getChapters(sessionId);
  });

  ipcMain.handle("chapters:save", (_event, sessionId: string, chapterList: unknown) => {
    const validated = validateInput(FeatureChapterListSchema, chapterList);
    chapterGenerator.saveChapters(sessionId, validated);
  });

  ipcMain.handle("chapters:rename", (_event, sessionId: string, chapterIndex: number, newTitle: string) => {
    return chapterGenerator.renameChapter(sessionId, chapterIndex, newTitle);
  });

  ipcMain.handle("chapters:reorder", (_event, sessionId: string, newOrder: number[]) => {
    return chapterGenerator.reorderChapters(sessionId, newOrder);
  });

  ipcMain.handle("chapters:delete", (_event, sessionId: string) => {
    chapterGenerator.deleteChapters(sessionId);
  });
}
