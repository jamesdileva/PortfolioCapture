import { exec } from "child_process";
import { promisify } from "util";
import type Database from "better-sqlite3";
import { existsSync } from "fs";

export type ExecFn = (cmd: string) => Promise<{ stdout: string }>;

const defaultExecFn: ExecFn = (cmd) => promisify(exec)(cmd, { timeout: 5000 }) as Promise<{ stdout: string }>;

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: HealthCheckItem[];
  checkedAt: string;
}

export interface HealthCheckItem {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface HealthCheckConfig {
  dbPath?: string;
  migrationsDir?: string;
  execFn?: ExecFn;
}

export async function runHealthChecks(
  db: Database.Database,
  config?: HealthCheckConfig,
): Promise<HealthCheckResult> {
  const checks: HealthCheckItem[] = [];
  const execFn = config?.execFn ?? defaultExecFn;

  checks.push(await checkDbWritable(db));
  checks.push(await checkFfmpegAvailable(execFn));
  if (config?.migrationsDir) {
    checks.push(await checkMigrationsDirectory(config.migrationsDir));
  }

  const failed = checks.filter((c) => c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");

  let status: HealthCheckResult["status"] = "healthy";
  if (failed.length > 0) status = "unhealthy";
  else if (warns.length > 0) status = "degraded";

  return { status, checks, checkedAt: new Date().toISOString() };
}

async function checkDbWritable(db: Database.Database): Promise<HealthCheckItem> {
  try {
    db.prepare("SELECT 1").get();
    return { name: "database", status: "pass", message: "Database is readable" };
  } catch (err) {
    return {
      name: "database",
      status: "fail",
      message: `Database error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkFfmpegAvailable(execFn: ExecFn): Promise<HealthCheckItem> {
  try {
    const { stdout } = await execFn("ffmpeg -version");
    const versionMatch = stdout.match(/ffmpeg version (\S+)/);
    return {
      name: "ffmpeg",
      status: "pass",
      message: `FFmpeg found: ${versionMatch?.[1] ?? "unknown version"}`,
    };
  } catch {
    return {
      name: "ffmpeg",
      status: "warn",
      message: "FFmpeg not found in PATH — recording features unavailable",
    };
  }
}

async function checkMigrationsDirectory(migrationsDir: string): Promise<HealthCheckItem> {
  try {
    if (!existsSync(migrationsDir)) {
      return { name: "migrations", status: "warn", message: "Migrations directory not found" };
    }
    return { name: "migrations", status: "pass", message: "Migrations directory exists" };
  } catch (err) {
    return {
      name: "migrations",
      status: "warn",
      message: `Migration check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
