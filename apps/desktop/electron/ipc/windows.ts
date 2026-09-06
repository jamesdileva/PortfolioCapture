import { ipcMain } from "electron";
import { WindowEnumeratorImpl } from "../services/window-enumerator.js";

export function registerWindowHandlers(enumerator: WindowEnumeratorImpl): void {
  ipcMain.handle("windows:list", async () => {
    return enumerator.listWindows();
  });
}
