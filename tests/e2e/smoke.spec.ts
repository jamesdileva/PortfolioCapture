import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const ROOT = path.resolve(__dirname, "../..");
const MAIN_JS = path.join(ROOT, "apps/desktop/electron/dist/main.js");

function makeUserDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-e2e-"));
  return dir;
}

test.describe("Smoke Test — App Launch", () => {
  let userDataDir: string;

  test.beforeEach(() => {
    userDataDir = makeUserDataDir();
  });

  test.afterEach(async () => {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  });

  test("app launches and shows main window", async () => {
    const app = await electron.launch({
      args: [MAIN_JS, "--user-data-dir", userDataDir],
    });

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
    const app = await electron.launch({
      args: [MAIN_JS, "--user-data-dir", userDataDir],
    });

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
    const app = await electron.launch({
      args: [MAIN_JS, "--user-data-dir", userDataDir],
    });

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
