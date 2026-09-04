import { ipcMain } from "electron";
import type { ManualEditOverridesServiceImpl } from "../services/manual-edit-overrides-service.js";
import type { TimelineOverrides } from "../../../../packages/shared/types/index.js";

export function registerManualOverridesHandlers(overridesService: ManualEditOverridesServiceImpl): void {
  ipcMain.handle("overrides:get", (_event, sessionId: string) => {
    return overridesService.getOverrides(sessionId);
  });

  ipcMain.handle("overrides:save", (_event, sessionId: string, overrides: TimelineOverrides) => {
    overridesService.saveOverrides(sessionId, overrides);
  });

  ipcMain.handle("overrides:clear", (_event, sessionId: string) => {
    overridesService.clearOverrides(sessionId);
  });
}
