import { ipcMain } from "electron";
import type { RecordingProfileServiceImpl } from "../services/recording-profile-service.js";
import { CreateProfileInputSchema, UpdateProfileInputSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerProfileHandlers(profileService: RecordingProfileServiceImpl): void {
  ipcMain.handle("profiles:list", () => {
    return profileService.list();
  });

  ipcMain.handle("profiles:get", (_event, id: string) => {
    return profileService.getById(id);
  });

  ipcMain.handle("profiles:create", (_event, input) => {
    const validated = validateInput(CreateProfileInputSchema, input);
    return profileService.create(validated);
  });

  ipcMain.handle("profiles:update", (_event, id: string, input) => {
    const validated = validateInput(UpdateProfileInputSchema, input);
    return profileService.update(id, validated);
  });

  ipcMain.handle("profiles:delete", (_event, id: string) => {
    profileService.delete(id);
  });

  ipcMain.handle("profiles:getPreset", (_event, presetName: string) => {
    return profileService.getPreset(presetName as Parameters<RecordingProfileServiceImpl["getPreset"]>[0]);
  });

  ipcMain.handle("profiles:getSettings", (_event, id: string) => {
    return profileService.getSettingsForProfile(id);
  });
}
