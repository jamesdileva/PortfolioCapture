import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { spawn, execSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const ELECTRON_EXE = require("electron") as string;
const MAIN_JS = path.join(ROOT, "apps/desktop/electron/dist/main.js");

// GUI fixture with a real window. Override with E2E_WINDOW_EXE=/path/to/app.exe.
// Skipped when absent. WorldSim (pywebview/WebView2) is the primary fixture:
// its GPU-composited pixels are invisible to GDI scraping, so a non-blank
// capture proves the Electron capture path end to end.
const WINDOW_EXE =
  process.env.E2E_WINDOW_EXE ??
  "C:\\Users\\j\\Projects\\worldsim\\dist\\worldsim\\worldsim.exe";

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

interface LiveWindow { title: string; pid: number; hwnd: string }

async function listWindows(window: import("playwright").Page): Promise<LiveWindow[]> {
  return window.evaluate(() =>
    (window as unknown as { portfolio: { windows: { list: () => Promise<LiveWindow[]> } } }).portfolio.windows.list()
  );
}

test.describe("Window Capture — app-window recording", () => {
  test.setTimeout(300000);
  test("binds a live window title and records it", async () => {
    test.skip(!fs.existsSync(WINDOW_EXE), `window fixture missing: ${WINDOW_EXE}`);
    const app = await launchApp();
    let fixture: ChildProcess | undefined;

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");

      // Discover the fixture's live window title first (cold start can be slow).
      fixture = spawn(WINDOW_EXE, [], { cwd: path.dirname(WINDOW_EXE) });
      const marker = path.basename(WINDOW_EXE, ".exe").toLowerCase();
      let live: LiveWindow[] = [];
      let match: LiveWindow | undefined;
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        live = await listWindows(window);
        match = live.find((w) => w.title.toLowerCase().includes(marker));
        if (match) break;
      }
      expect(
        match,
        `no window matching "${marker}" among: ${live.map((w) => w.title).join(" | ")}`
      ).toBeTruthy();
      killTree(fixture);
      fixture = undefined;
      const windowTitle = match!.title;

      // Bind the project to that window through the real UI.
      await window.getByRole("button", { name: "Projects" }).click();
      await window.getByRole("button", { name: "Add Project" }).click();
      await window.getByLabel("Name", { exact: false }).fill("E2E Window Fixture");
      await window.getByLabel("Project Path", { exact: false }).fill(path.dirname(WINDOW_EXE));
      await window.getByLabel("Executable Path", { exact: false }).fill(WINDOW_EXE);
      await window.getByLabel("App window").click();
      await window.getByLabel("Window title (exact)").fill(windowTitle);
      await window.getByRole("button", { name: "Create" }).click();
      await expect(window.locator("tr", { hasText: "E2E Window Fixture" })).toContainText("🪟");

      // Relaunch — process detection should start a window-scoped recording.
      fixture = spawn(WINDOW_EXE, [], { cwd: path.dirname(WINDOW_EXE) });
      await expect(window.getByText("● Recording")).toBeVisible({ timeout: 30000 });

      await new Promise((r) => setTimeout(r, 8000));
      killTree(fixture);
      fixture = undefined;

      await expect(window.getByText("● Recording")).toHaveCount(0, { timeout: 120000 });

      const getSessions = () => window.evaluate(() =>
        (window as unknown as { portfolio: { sessions: { list: () => Promise<Array<{ id: string; status: string; startedAt: string; rawVideoPath: string | null }>> } } }).portfolio.sessions.list()
      );
      // The session we triggered is the latest; wait for it to finish finalizing.
      let latest: { id: string; status: string; startedAt: string; rawVideoPath: string | null } | undefined;
      const finalizeDeadline = Date.now() + 60000;
      while (Date.now() < finalizeDeadline) {
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
      expect(fs.existsSync(latest!.rawVideoPath!)).toBe(true);
      expect(fs.statSync(latest!.rawVideoPath!).size).toBeGreaterThan(1024);
      // Must be a finalized, playable container (moov present) — not just bytes.
      const probe = execSync(
        `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${latest!.rawVideoPath!}"`,
        { encoding: "utf-8" }
      );
      expect(probe).toContain("video");
      // Must show real window content, not a GDI-scrape blank (YAVG ~235+).
      const stats = execSync(
        `ffmpeg -v info -i "${latest!.rawVideoPath!}" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>&1`,
        { encoding: "utf-8" }
      );
      const brightnessValues = [...stats.matchAll(/YAVG=([\d.]+)/g)]
        .map((m) => parseFloat(m[1]))
        .filter((n) => !isNaN(n));
      expect(brightnessValues.length).toBeGreaterThan(0);
      const avgBrightness = brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length;
      expect(avgBrightness).toBeLessThan(150);
    } finally {
      if (fixture) killTree(fixture);
      await app.close();
    }
  });
});
