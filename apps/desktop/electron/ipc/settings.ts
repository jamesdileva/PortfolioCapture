import { ipcMain } from "electron";
import type { SettingsService } from "../services/settings-service.js";

export function registerSettingsHandlers(settingsService: SettingsService): void {
  ipcMain.handle("settings:get", () => {
    return settingsService.getAll();
  });

  ipcMain.handle("settings:set", (_event, key: string, value: string) => {
    settingsService.set(key, value);
  });

  ipcMain.handle("settings:delete", (_event, key: string) => {
    return settingsService.delete(key);
  });
}
