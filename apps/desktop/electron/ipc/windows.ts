import { ipcMain } from "electron";
import { WindowEnumeratorImpl } from "../services/window-enumerator.js";
import { WindowCaptureTester } from "../services/window-capture-tester.js";

export function registerWindowHandlers(enumerator: WindowEnumeratorImpl, captureTester?: WindowCaptureTester): void {
  ipcMain.handle("windows:list", async () => {
    return enumerator.listWindows();
  });

  ipcMain.handle("windows:testCapture", async (_event, title: string) => {
    if (!captureTester) throw new Error("Window capture testing is not available");
    if (!title || typeof title !== "string" || !title.trim()) throw new Error("A window title is required");
    return captureTester.testCapture(title);
  });
}
