import { ipcMain } from "electron";
import { DevServerDetectorImpl } from "../services/dev-server-detector.js";

export function registerDevServerHandlers(detector: DevServerDetectorImpl): void {
  ipcMain.handle("devserver:status", () => {
    return detector.getActiveServers();
  });

  ipcMain.handle("devserver:start", async () => {
    await detector.start();
  });

  ipcMain.handle("devserver:stop", () => {
    detector.stop();
  });
}
