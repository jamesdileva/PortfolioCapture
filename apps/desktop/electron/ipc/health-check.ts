import { ipcMain } from "electron";
import type Database from "better-sqlite3";
import { runHealthChecks, type HealthCheckConfig } from "../services/health-check.js";

export function registerHealthCheckHandlers(db: Database.Database, config?: HealthCheckConfig) {
  ipcMain.handle("health:check", async () => {
    return runHealthChecks(db, config);
  });
}
