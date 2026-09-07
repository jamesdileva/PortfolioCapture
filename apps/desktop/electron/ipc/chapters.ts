import { ipcMain } from "electron";
import type { FeatureChapterGeneratorImpl } from "../services/feature-chapter-generator.js";
import type { FeatureEvidence, FeatureChapterGeneratorConfig } from "../../../../packages/shared/types/index.js";

export function registerChapterHandlers(chapterGenerator: FeatureChapterGeneratorImpl): void {
  ipcMain.handle("chapters:generate", async (_event, videoPath: string, sessionId: string, featureEvidence: FeatureEvidence[], config?: Partial<FeatureChapterGeneratorConfig>) => {
    return chapterGenerator.generateChapters(videoPath, sessionId, featureEvidence, config);
  });

  ipcMain.handle("chapters:get", (_event, sessionId: string) => {
    return chapterGenerator.getChapters(sessionId);
  });

  ipcMain.handle("chapters:save", (_event, sessionId: string, chapterList: Parameters<FeatureChapterGeneratorImpl["saveChapters"]>[1]) => {
    chapterGenerator.saveChapters(sessionId, chapterList);
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
