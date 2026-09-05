import { ipcMain } from "electron";
import type { FeatureEvidenceServiceImpl } from "../services/feature-evidence-service.js";
import type { FeatureEvidenceUpdateInput } from "../../../../packages/shared/types/index.js";

export function registerFeatureEvidenceHandlers(service: FeatureEvidenceServiceImpl): void {
  ipcMain.handle("feature-evidence:generate", async (_event, projectId: string) => {
    return service.generate(projectId);
  });

  ipcMain.handle("feature-evidence:list", async (_event, projectId: string) => {
    return service.list(projectId);
  });

  ipcMain.handle("feature-evidence:get", async (_event, id: string) => {
    return service.getById(id);
  });

  ipcMain.handle("feature-evidence:save", async (_event, input: { projectId: string; featureName: string; description?: string; confidence?: number; commits?: Array<{ sha: string; message: string; date: string }>; screenshotPaths?: string[]; recordingSegmentPaths?: string[]; readmeSnippet?: string | null }) => {
    return service.save(input);
  });

  ipcMain.handle("feature-evidence:update", async (_event, id: string, input: FeatureEvidenceUpdateInput) => {
    return service.update(id, input);
  });

  ipcMain.handle("feature-evidence:accept", async (_event, id: string) => {
    return service.accept(id);
  });

  ipcMain.handle("feature-evidence:reject", async (_event, id: string) => {
    return service.reject(id);
  });

  ipcMain.handle("feature-evidence:delete", async (_event, id: string) => {
    service.delete(id);
  });
}
