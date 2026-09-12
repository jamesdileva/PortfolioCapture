import { app, BrowserWindow, dialog } from "electron";
import * as path from "path";
import { createDatabase, runMigrations, closeDatabase } from "../../../packages/database/index.js";
import { ProjectRepository, SessionRepository, AssetRepository, SettingsRepository, FeatureEvidenceRepository } from "../../../packages/database/repositories/index.js";
import { ProjectService, SessionService, AssetService, SettingsService, ProcessMonitor, FfmpegCaptureProvider, FfmpegServiceImpl, FfmpegScreenshotExtractor, IdleDetectorImpl, SmartTrimmerImpl, DemoGeneratorImpl, ExportServiceImpl, ScreenshotRankerImpl, TimelineAssemblerImpl, RecordingProfileServiceImpl, ManualEditOverridesServiceImpl, GitServiceImpl, ProjectScannerImpl, FeatureEvidenceServiceImpl, LocalAiServiceImpl, PortfolioGeneratorImpl, ThemeServiceImpl, DeployServiceImpl, DevServerDetectorImpl, WindowEnumeratorImpl, FeatureChapterGeneratorImpl, SceneDetectorImpl, DemoQualityScorerImpl, ProjectAutoFillServiceImpl, InteractionCollectorImpl, CrashRecoveryServiceImpl } from "./services/index.js";
import { SessionManager } from "./services/session-manager.js";
import { PortfolioUpdateTriggerImpl } from "./services/portfolio-update-trigger.js";
import { registerProjectHandlers, registerSessionHandlers, registerAssetHandlers, registerSettingsHandlers, registerExportHandlers, registerProfileHandlers, registerManualOverridesHandlers, registerGitHandlers, registerScannerHandlers, registerFeatureEvidenceHandlers, registerAiHandlers, registerPortfolioHandlers, registerThemeHandlers, registerDeployHandlers, registerDevServerHandlers, registerWindowHandlers, registerChapterHandlers, registerDemoQualityHandlers, registerCrashRecoveryHandlers, registerHealthCheckHandlers } from "./ipc/index.js";
import { installCspHeaders } from "./security/index.js";

import { appendFileSync, mkdirSync } from "fs";
import { runHealthChecks } from "./services/health-check.js";

let _logDir: string;
try { _logDir = path.join(app.getPath("userData"), "logs"); } catch (_) { _logDir = path.join(process.env.LOCALAPPDATA || process.env.TEMP || ".", "portfolio-auto-recorder"); }
try { mkdirSync(_logDir, { recursive: true }); } catch (_) {}
const _logFile = path.join(_logDir, "startup.log");
let _logFileExe: string | null = null;
try { _logFileExe = path.join(path.dirname(process.execPath), "startup.log"); } catch (_) {}
function _log(msg: string) {
  try {
    const line = new Date().toISOString() + " [main] " + msg + "\n";
    try { appendFileSync(_logFile, line); } catch (_) {}
    try { if (_logFileExe && _logFileExe !== _logFile) appendFileSync(_logFileExe, line); } catch (_) {}
  } catch (_) {}
}
_log("MODULE_LOADED: main.ts top-level");
_log("EXE_IDENTITY: execPath=" + process.execPath + " resources=" + (process.resourcesPath ?? "?"));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  _log("createWindow: START");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Portfolio Auto Recorder",
    show: false,
  });

  installCspHeaders(mainWindow.webContents.session);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (process.env.NODE_ENV === "development" || devServerUrl) {
    mainWindow.loadURL(devServerUrl ?? "http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../renderer/dist/index.html")).catch((err) => {
      console.error("loadFile failed:", err);
      dialog.showErrorBox("Portfolio Auto Recorder — Load Error", err.stack ?? err.message);
      app.exit(1);
    });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function initializeServices() {
  _log("initializeServices: resolving userData path");
  const userDataPath = app.getPath("userData");
  _log("initializeServices: userData=" + userDataPath);

  _log("initializeServices: creating database at " + userDataPath);
  const dbPath = path.join(userDataPath, "portfoliodb.sqlite");
  _log("initializeServices: dbPath=" + dbPath);
  try {
    const vers = (process as unknown as { versions: Record<string, string> }).versions;
    _log("initializeServices: versions node=" + vers.node + " electron=" + vers.electron + " arch=" + process.arch);
  } catch (_) {}
  try {
    const bsqlPkg = require("better-sqlite3/package.json") as { version: string };
    _log("initializeServices: better-sqlite3 version=" + bsqlPkg.version);
  } catch (verr) {
    _log("initializeServices: better-sqlite3 version lookup FAILED: " + String(verr));
  }
  try {
    const resolved = require.resolve("better-sqlite3");
    _log("initializeServices: better-sqlite3 resolved=" + resolved);
  } catch (rerr) {
    _log("initializeServices: better-sqlite3 resolve FAILED: " + String(rerr));
  }
  try {
    const fsMod = require("fs") as typeof import("fs");
    const bsqlDir = path.dirname(require.resolve("better-sqlite3/package.json"));
    for (const cand of ["prebuilds", "build/Release"]) {
      const dir = path.join(bsqlDir, cand);
      let entries: string;
      try {
        entries = fsMod.readdirSync(dir).join(",");
      } catch (_) {
        entries = "<missing>";
      }
      _log("initializeServices: better-sqlite3 " + cand + "=[" + entries + "]");
    }
  } catch (lerr) {
    _log("initializeServices: better-sqlite3 prebuild listing FAILED: " + String(lerr));
  }
  try {
    const bsqlMod = require("better-sqlite3") as unknown;
    _log("initializeServices: require(better-sqlite3) OK typeof=" + typeof bsqlMod);
  } catch (reqErr) {
    _log("initializeServices: require(better-sqlite3) FAILED: " + (reqErr instanceof Error ? reqErr.stack ?? reqErr.message : String(reqErr)));
  }
  try {
    const probe = path.join(userDataPath, "write-probe.tmp");
    require("fs").writeFileSync(probe, "ok");
    require("fs").unlinkSync(probe);
    _log("initializeServices: userData writable OK");
  } catch (werr) {
    _log("initializeServices: userData write probe FAILED: " + String(werr));
  }
  _log("initializeServices: memory DB probe START");
  try {
    const memDb = createDatabase(":memory:");
    _log("initializeServices: memory DB probe opened OK");
    closeDatabase(memDb);
    _log("initializeServices: memory DB probe closed OK");
  } catch (memErr) {
    _log("initializeServices: memory DB probe FAILED: " + (memErr instanceof Error ? memErr.stack ?? memErr.message : String(memErr)));
  }
  _log("initializeServices: calling new Database() next");
  let db: ReturnType<typeof createDatabase>;
  try {
    db = createDatabase(dbPath);
    _log("initializeServices: database created OK");
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.stack ?? dbErr.message : String(dbErr);
    _log("initializeServices: createDatabase FAILED: " + msg);
    throw dbErr;
  }
  _log("initializeServices: running migrations");

  runMigrations(db);
  _log("initializeServices: migrations done, creating repositories");

  const projectRepo = new ProjectRepository(db);
  const sessionRepo = new SessionRepository(db);
  const assetRepo = new AssetRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const evidenceRepo = new FeatureEvidenceRepository(db);
  _log("initializeServices: repositories created, building services");

  const projectService = new ProjectService(projectRepo);
  const sessionService = new SessionService(sessionRepo);
  const assetService = new AssetService(assetRepo);
  const settingsService = new SettingsService(settingsRepo);

  const captureProvider = new FfmpegCaptureProvider();
  const outputRoot = path.join(app.getPath("userData"), "recordings");

  const ffmpegService = new FfmpegServiceImpl();
  const screenshotExtractor = new FfmpegScreenshotExtractor(ffmpegService);
  const smartTrimmer = new SmartTrimmerImpl(ffmpegService);
  const demoGenerator = new DemoGeneratorImpl(ffmpegService);
  const screenshotRanker = new ScreenshotRankerImpl();
  const timelineAssembler = new TimelineAssemblerImpl();
  const sceneDetector = new SceneDetectorImpl();
  const chapterGenerator = new FeatureChapterGeneratorImpl(sceneDetector);
  const demoQualityScorer = new DemoQualityScorerImpl();

  _log("initializeServices: registering core IPC handlers");
  registerProjectHandlers(projectService, () => refreshMonitorProjects());
  registerAssetHandlers(assetService);
  registerSettingsHandlers(settingsService);
  _log("initializeServices: core IPC handlers registered");

  const exportService = new ExportServiceImpl(projectService, sessionService, assetService, path.join(app.getPath("userData"), "exports"));
  registerExportHandlers(exportService);

  const deployService = new DeployServiceImpl();
  registerDeployHandlers(deployService);

  const profileService = new RecordingProfileServiceImpl(settingsService);
  registerProfileHandlers(profileService);

  const overridesService = new ManualEditOverridesServiceImpl(settingsService);
  registerManualOverridesHandlers(overridesService);

  const gitService = new GitServiceImpl();
  registerGitHandlers(gitService);

  const scannerService = new ProjectScannerImpl();
  const autoFillService = new ProjectAutoFillServiceImpl();
  registerScannerHandlers(scannerService, autoFillService);

  const featureEvidenceService = new FeatureEvidenceServiceImpl(evidenceRepo, projectRepo, sessionRepo, assetRepo, gitService);
  registerFeatureEvidenceHandlers(featureEvidenceService);

  const aiService = new LocalAiServiceImpl();
  registerAiHandlers(aiService);

  const themeService = new ThemeServiceImpl(settingsService);
  registerThemeHandlers(themeService);

  const portfolioOutputDir = path.join(app.getPath("userData"), "portfolio");
  const portfolioGenerator = new PortfolioGeneratorImpl(projectService, sessionService, assetService, portfolioOutputDir, themeService);
  registerPortfolioHandlers(portfolioGenerator, portfolioOutputDir);

  const portfolioUpdateTrigger = new PortfolioUpdateTriggerImpl(portfolioGenerator, () => {
    mainWindow?.webContents.send("portfolio:regenerated");
  });

  const sessionManager = new SessionManager({
    sessionService,
    captureProvider,
    projectService,
    config: { outputRoot },
    screenshotExtractor,
    assetService,
    idleDetectorFactory: () => new IdleDetectorImpl(),
    settingsService,
    smartTrimmer,
    demoGenerator,
    screenshotRanker,
    timelineAssembler,
    featureChapterGenerator: chapterGenerator,
    demoQualityScorer,
    featureEvidenceService,
    sceneDetector,
    interactionCollectorFactory: () => new InteractionCollectorImpl(),
    onSessionComplete: () => {
      portfolioUpdateTrigger.requestUpdate();
    },
  });

  registerSessionHandlers(sessionService, sessionManager, profileService);

  const processMonitor = new ProcessMonitor();

  const projects = projectService.list();
  processMonitor.setProjects(
    projects.map((p) => ({ id: p.id, executablePath: p.executablePath, name: p.name }))
  );

  processMonitor.onProcessStarted(async (proc) => {
    const matchedProject = processMonitor.matchProject(proc);
    if (matchedProject) {
      await sessionManager.onProcessStarted(matchedProject);
      const activeSession = sessionManager.getActiveSessionForProject(matchedProject.id);
      mainWindow?.webContents.send("portfolio:session-started", {
        process: proc,
        project: matchedProject,
        sessionId: activeSession?.session.id,
      });
    }
  });

  processMonitor.onProcessStopped(async (proc) => {
    const matchedProject = processMonitor.matchProject(proc);
    if (matchedProject) {
      await sessionManager.onProcessStopped(matchedProject);
      mainWindow?.webContents.send("portfolio:session-stopped", {
        process: proc,
        project: matchedProject,
      });
    }
  });

  processMonitor.start().catch(() => {});

  const devServerDetector = new DevServerDetectorImpl();
  devServerDetector.setProjects(
    projects.map((p) => ({ id: p.id, devServerPorts: p.devServerPorts, name: p.name }))
  );

  devServerDetector.onDevServerStarted(async (info, project) => {
    if (project) {
      await sessionManager.onDevServerStarted(project);
      const activeSession = sessionManager.getActiveSessionForProject(project.id);
      mainWindow?.webContents.send("portfolio:devserver-started", {
        server: info,
        project,
        sessionId: activeSession?.session.id,
      });
    }
  });

  devServerDetector.onDevServerStopped(async (info, project) => {
    if (project) {
      await sessionManager.onDevServerStopped(project);
      mainWindow?.webContents.send("portfolio:devserver-stopped", {
        server: info,
        project,
      });
    }
  });

  devServerDetector.start().catch(() => {});

  registerDevServerHandlers(devServerDetector);

  const windowEnumerator = new WindowEnumeratorImpl();
  registerWindowHandlers(windowEnumerator);

  function refreshMonitorProjects(): void {
    const list = projectService.list();
    processMonitor.setProjects(
      list.map((p) => ({ id: p.id, executablePath: p.executablePath, name: p.name }))
    );
    _log("initializeServices: processMonitor projects refreshed (" + list.length + ")");
    devServerDetector.setProjects(
      list.map((p) => ({ id: p.id, devServerPorts: p.devServerPorts, name: p.name }))
    );
    _log("initializeServices: devServerDetector projects refreshed (" + list.length + ")");
  }

  registerChapterHandlers(chapterGenerator);

  registerDemoQualityHandlers(demoQualityScorer);

  const crashRecovery = new CrashRecoveryServiceImpl(sessionService);
  registerCrashRecoveryHandlers(crashRecovery, projectService);

  registerHealthCheckHandlers(db, { migrationsDir: path.join(__dirname, "migrations") });

  _log("initializeServices: all services wired, returning");
  return { db, projectService, sessionService, assetService, settingsService, processMonitor, sessionManager, crashRecovery };
}

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  _log("UNHANDLED_REJECTION: " + msg);
});

app.whenReady().then(() => {
  _log("app.whenReady: FIRED");
  try {
    _log("initializeServices: START");
    const services = initializeServices();
    _log("initializeServices: DONE");

    _log("runHealthChecks: START");
    runHealthChecks(services.db, { migrationsDir: path.join(__dirname, "migrations") })
      .then((result) => {
        _log(`Health check: ${result.status}`);
        for (const check of result.checks) {
          _log(`  ${check.name}: ${check.status} — ${check.message}`);
        }
        if (result.status === "unhealthy") {
          dialog.showErrorBox(
            "Portfolio Auto Recorder — Startup Warning",
            result.checks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.message}`).join("\n"),
          );
        }
      })
      .catch((err) => {
        _log("Health check failed: " + (err instanceof Error ? err.message : String(err)));
      });

    _log("createWindow: START");
    createWindow();
    _log("createWindow: DONE");

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    _log("STARTUP_ERROR: " + (error instanceof Error ? error.stack ?? error.message : String(error)));
    const msg = error instanceof Error ? error.stack ?? error.message : String(error);
    dialog.showErrorBox("Portfolio Auto Recorder — Startup Error", msg);
    app.exit(1);
  }
}).catch((err) => {
  _log("WHEN_READY_ERROR: " + (err instanceof Error ? err.stack ?? err.message : String(err)));
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  dialog.showErrorBox("Portfolio Auto Recorder — Startup Error", msg);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
