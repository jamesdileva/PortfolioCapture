import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const ELECTRON_EXE = require("electron") as string;
const MAIN_JS = path.join(ROOT, "apps/desktop/electron/dist/main.js");

async function launchApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "par-e2e-"));
  return electron.launch({
    executablePath: ELECTRON_EXE,
    args: [MAIN_JS, `--user-data-dir=${userDataDir}`],
    ignoreDefaultArgs: ["--remote-debugging-port=0"],
  });
}

test.describe("Smoke Test — App Launch", () => {
  test("app launches and shows main window", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      await expect(window.locator("h1")).toContainText("Portfolio Auto Recorder");

      const title = await window.title();
      expect(title).toContain("Portfolio Auto Recorder");
    } finally {
      await app.close();
    }
  });

  test("dashboard tab renders by default", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      await expect(window.getByRole("button", { name: "Dashboard" })).toBeVisible();
      await expect(window.getByRole("button", { name: "Projects" })).toBeVisible();
      await expect(window.getByRole("button", { name: "Recordings" })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("no startup errors in log", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      const errors: string[] = [];
      window.on("pageerror", (err) => errors.push(err.message));

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
