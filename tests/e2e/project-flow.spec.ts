import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const ELECTRON_EXE = require("electron") as string;
const MAIN_JS = path.join(ROOT, "apps/desktop/electron/dist/main.js");

async function launchApp() {
  return electron.launch({
    executablePath: ELECTRON_EXE,
    args: [MAIN_JS],
    ignoreDefaultArgs: ["--remote-debugging-port=0"],
  });
}

test.describe("Project Flow — Create & List", () => {
  test("create project and verify it appears in list", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      await window.getByRole("button", { name: "Projects" }).click();
      await expect(window.getByRole("button", { name: "Add Project" })).toBeVisible();

      await window.getByRole("button", { name: "Add Project" }).click();
      await expect(window.locator("h2")).toContainText("Add Project");

      await window.getByLabel("Name").fill("E2E Test Project");
      await window.getByLabel("Project Path").fill("C:\\Users\\test\\e2e-project");

      await window.getByRole("button", { name: "Create" }).click();

      await expect(window.locator("td")).toContainText("E2E Test Project");
      await expect(window.locator("td")).toContainText("C:\\Users\\test\\e2e-project");
    } finally {
      await app.close();
    }
  });

  test("empty project list shows prompt", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      await window.getByRole("button", { name: "Projects" }).click();

      await expect(window.getByText("No projects yet")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("create and edit project", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      await window.getByRole("button", { name: "Projects" }).click();
      await window.getByRole("button", { name: "Add Project" }).click();

      await window.getByLabel("Name").fill("Edit Test");
      await window.getByLabel("Project Path").fill("C:\\edit-test");
      await window.getByRole("button", { name: "Create" }).click();

      await expect(window.locator("td")).toContainText("Edit Test");

      await window.getByRole("button", { name: "Edit" }).first().click();
      await expect(window.locator("h2")).toContainText("Edit Project");

      await window.getByLabel("Name").fill("Edit Test Updated");
      await window.getByRole("button", { name: "Update" }).click();

      await expect(window.locator("td")).toContainText("Edit Test Updated");
    } finally {
      await app.close();
    }
  });

  test("delete project after creation", async () => {
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      await window.getByRole("button", { name: "Projects" }).click();
      await window.getByRole("button", { name: "Add Project" }).click();

      await window.getByLabel("Name").fill("Delete Test");
      await window.getByLabel("Project Path").fill("C:\\delete-test");
      await window.getByRole("button", { name: "Create" }).click();

      await expect(window.locator("td")).toContainText("Delete Test");

      window.on("dialog", (dialog) => dialog.accept());
      await window.getByRole("button", { name: "Delete" }).first().click();

      await expect(window.getByText("No projects yet")).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
