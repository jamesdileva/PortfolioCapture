import { ipcMain } from "electron";
import type { AssetService } from "../services/asset-service.js";
import type { AssetType } from "../../../../packages/shared/types/index.js";

export function registerAssetHandlers(assetService: AssetService): void {
  ipcMain.handle("assets:listByProject", (_event, projectId: string) => {
    return assetService.listByProject(projectId);
  });

  ipcMain.handle("assets:listBySession", (_event, sessionId: string) => {
    return assetService.listBySession(sessionId);
  });

  ipcMain.handle("assets:listByType", (_event, projectId: string, type: AssetType) => {
    return assetService.listByType(projectId, type);
  });

  ipcMain.handle("assets:get", (_event, id: string) => {
    return assetService.getById(id);
  });

  ipcMain.handle("assets:create", (_event, input) => {
    return assetService.create(input);
  });

  ipcMain.handle("assets:delete", (_event, id: string) => {
    return assetService.delete(id);
  });
}
