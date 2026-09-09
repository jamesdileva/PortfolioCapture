import { ipcMain } from "electron";
import type { ManualEditOverridesServiceImpl } from "../services/manual-edit-overrides-service.js";
import { TimelineOverridesSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerManualOverridesHandlers(overridesService: ManualEditOverridesServiceImpl): void {
  ipcMain.handle("overrides:get", (_event, sessionId: string) => {
    return overridesService.getOverrides(sessionId);
  });

  ipcMain.handle("overrides:save", (_event, sessionId: string, overrides: unknown) => {
    const validated = validateInput(TimelineOverridesSchema, overrides);
    overridesService.saveOverrides(sessionId, validated);
  });

  ipcMain.handle("overrides:clear", (_event, sessionId: string) => {
    overridesService.clearOverrides(sessionId);
  });
}
