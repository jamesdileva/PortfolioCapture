import { app, BrowserWindow, dialog } from "electron";
import * as path from "path";
import { createDatabase, runMigrations, closeDatabase } from "../../../packages/database/index.js";
import { ProjectRepository, SessionRepository, AssetRepository, SettingsRepository, FeatureEvidenceRepository } from "../../../packages/database/repositories/index.js";
import { ProjectService, SessionService, AssetService, SettingsService, ProcessMonitor, FfmpegCaptureProvider, FfmpegServiceImpl, FfmpegScreenshotExtractor, IdleDetectorImpl, SmartTrimmerImpl, DemoGeneratorImpl, ExportServiceImpl, ScreenshotRankerImpl, TimelineAssemblerImpl, RecordingProfileServiceImpl, ManualEditOverridesServiceImpl, GitServiceImpl, ProjectScannerImpl, FeatureEvidenceServiceImpl, LocalAiServiceImpl, PortfolioGeneratorImpl, ThemeServiceImpl, DeployServiceImpl, DevServerDetectorImpl, WindowEnumeratorImpl, FeatureChapterGeneratorImpl, SceneDetectorImpl, DemoQualityScorerImpl, ProjectAutoFillServiceImpl } from "./services/index.js";
import { SessionManager } from "./services/session-manager.js";
import { PortfolioUpdateTriggerImpl } from "./services/portfolio-update-trigger.js";
import { registerProjectHandlers, registerSessionHandlers, registerAssetHandlers, registerSettingsHandlers, registerExportHandlers, registerProfileHandlers, registerManualOverridesHandlers, registerGitHandlers, registerScannerHandlers, registerFeatureEvidenceHandlers, registerAiHandlers, registerPortfolioHandlers, registerThemeHandlers, registerDeployHandlers, registerDevServerHandlers, registerWindowHandlers, registerChapterHandlers, registerDemoQualityHandlers } from "./ipc/index.js";
import { installCspHeaders } from "./security/index.js";

const fsLog = require("fs");
const pathLog = require("path");
let _logDir: string;
try { _logDir = pathLog.join(require("electron").app.getPath("userData"), "logs"); } catch (_) { _logDir = pathLog.join(process.env.LOCALAPPDATA || process.env.TEMP || ".", "portfolio-auto-recorder"); }
try { fsLog.mkdirSync(_logDir, { recursive: true }); } catch (_) {}
const _logFile = pathLog.join(_logDir, "startup.log");
function _log(msg: string) { try { fsLog.appendFileSync(_logFile, new Date().toISOString() + " [main] " + msg + "\n"); } catch (_) {} }
_log("MODULE_LOADED: main.ts top-level");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  _log("createWindow: START");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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
  const dbPath = path.join(app.getPath("userData"), "database.sqlite");
  const db = createDatabase(dbPath);
  runMigrations(db);

  const projectRepo = new ProjectRepository(db);
  const sessionRepo = new SessionRepository(db);
  const assetRepo = new AssetRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const evidenceRepo = new FeatureEvidenceRepository(db);

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

  registerProjectHandlers(projectService);
  registerAssetHandlers(assetService);
  registerSettingsHandlers(settingsService);

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

  registerChapterHandlers(chapterGenerator);

  registerDemoQualityHandlers(demoQualityScorer);

  return { db, projectService, sessionService, assetService, settingsService, processMonitor, sessionManager };
}

app.whenReady().then(() => {
  _log("app.whenReady: FIRED");
  try {
    _log("initializeServices: START");
    initializeServices();
    _log("initializeServices: DONE");
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
