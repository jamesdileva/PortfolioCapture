import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { spawn, execSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const ELECTRON_EXE = require("electron") as string;
const MAIN_JS = path.join(ROOT, "apps/desktop/electron/dist/main.js");

// Real-world fixture: a backend server exe that stays running until killed.
// Override with E2E_FIXTURE_EXE=/path/to/app.exe. Skipped when absent so the
// default suite stays green on machines without the fixture.
const FIXTURE_EXE =
  process.env.E2E_FIXTURE_EXE ??
  "C:\\Users\\j\\Projects\\dinner-menu-generator\\backend\\dist\\app.exe";

async function launchApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "par-e2e-"));
  return electron.launch({
    executablePath: ELECTRON_EXE,
    args: [MAIN_JS, `--user-data-dir=${userDataDir}`],
    ignoreDefaultArgs: ["--remote-debugging-port=0"],
  });
}

function killTree(child: ChildProcess): void {
  try {
    if (child.pid) execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
  } catch {
    try { child.kill(); } catch { /* already dead */ }
  }
}

test.describe("Recording Flow — real app capture", () => {
  test.setTimeout(300000);
  test("spawning a watched exe records exactly the launch, viewable afterwards", async () => {
    test.skip(!fs.existsSync(FIXTURE_EXE), `fixture exe missing: ${FIXTURE_EXE}`);
    const app = await launchApp();
    let fixture: ChildProcess | undefined;

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      // Register the fixture exe as a project through the real UI.
      await window.getByRole("button", { name: "Projects" }).click();
      await window.getByRole("button", { name: "Add Project" }).click();
      await window.getByLabel("Name").fill("E2E Dinner Fixture");
      await window.getByLabel("Project Path").fill(path.dirname(FIXTURE_EXE));
      await window.getByLabel("Executable Path").fill(FIXTURE_EXE);
      await window.getByRole("button", { name: "Create" }).click();
      await expect(window.locator("tr", { hasText: "E2E Dinner Fixture" })).toBeVisible();

      // Launch the fixture — process detection (1s poll) should start recording.
      fixture = spawn(FIXTURE_EXE, [], { cwd: path.dirname(FIXTURE_EXE) });
      await expect(window.getByText("● Recording")).toBeVisible({ timeout: 30000 });

      // Let it record a few seconds, then terminate.
      await new Promise((r) => setTimeout(r, 8000));
      killTree(fixture);
      fixture = undefined;

      // Session finalizes (FFmpeg post-processing) and the indicator clears.
      await expect(window.getByText("● Recording")).toHaveCount(0, { timeout: 120000 });

      const getSessions = () => window.evaluate(() =>
        (window as unknown as { portfolio: { sessions: { list: () => Promise<Array<{ id: string; projectId: string; status: string; trigger: string; startedAt: string; rawVideoPath: string | null }>> } } }).portfolio.sessions.list()
      );
      // The session we triggered is the latest; wait for it to finish finalizing.
      let latest: { rawVideoPath: string | null } | undefined;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const sessions = await getSessions();
        const complete = sessions
          .filter((s) => s.status === "complete")
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        if (complete.length > 0 && complete[0].rawVideoPath) {
          latest = complete[0];
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      expect(latest, "expected a finalized session with a video path").toBeTruthy();
      {
        const s = latest!;
        expect(fs.existsSync(s.rawVideoPath!)).toBe(true);
        expect(fs.statSync(s.rawVideoPath!).size).toBeGreaterThan(1024);
        // Must be a finalized, playable container (moov present) — not just bytes.
        const probe = execSync(
          `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${s.rawVideoPath!}"`,
          { encoding: "utf-8" }
        );
        expect(probe).toContain("video");
      }
    } finally {
      if (fixture) killTree(fixture);
      await app.close();
    }
  });
});
