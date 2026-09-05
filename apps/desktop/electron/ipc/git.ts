import { ipcMain } from "electron";
import type { GitServiceImpl } from "../services/git-service.js";

export function registerGitHandlers(gitService: GitServiceImpl): void {
  ipcMain.handle("git:repoInfo", async (_event, projectPath: string) => {
    return gitService.getRepoInfo(projectPath);
  });

  ipcMain.handle("git:projectFile", async (_event, projectPath: string) => {
    return gitService.getProjectFileInfo(projectPath);
  });

  ipcMain.handle("git:metadata", async (_event, projectPath: string) => {
    return gitService.getProjectMetadata(projectPath);
  });
}
