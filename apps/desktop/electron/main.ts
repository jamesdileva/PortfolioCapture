import { app, BrowserWindow } from "electron";
import * as path from "path";
import { createDatabase, runMigrations, closeDatabase } from "../../../packages/database/index.js";
import { ProjectRepository, SessionRepository, AssetRepository, SettingsRepository } from "../../../packages/database/repositories/index.js";
import { ProjectService, SessionService, AssetService, SettingsService, ProcessMonitor, FfmpegCaptureProvider, FfmpegServiceImpl, FfmpegScreenshotExtractor, IdleDetectorImpl, SmartTrimmerImpl, DemoGeneratorImpl, ExportServiceImpl, ScreenshotRankerImpl } from "./services/index.js";
import { SessionManager } from "./services/session-manager.js";
import { registerProjectHandlers, registerSessionHandlers, registerAssetHandlers, registerSettingsHandlers, registerExportHandlers } from "./ipc/index.js";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (process.env.NODE_ENV === "development" || devServerUrl) {
    mainWindow.loadURL(devServerUrl ?? "http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
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

  const sessionManager = new SessionManager(
    sessionService,
    captureProvider,
    projectService,
    { outputRoot },
    screenshotExtractor,
    assetService,
    () => new IdleDetectorImpl(),
    settingsService,
    smartTrimmer,
    demoGenerator,
    screenshotRanker,
  );

  registerProjectHandlers(projectService);
  registerSessionHandlers(sessionService, sessionManager);
  registerAssetHandlers(assetService);
  registerSettingsHandlers(settingsService);

  const exportService = new ExportServiceImpl(projectService, sessionService, assetService, path.join(app.getPath("userData"), "exports"));
  registerExportHandlers(exportService);

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

  return { db, projectService, sessionService, assetService, settingsService, processMonitor, sessionManager };
}

app.whenReady().then(() => {
  initializeServices();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
