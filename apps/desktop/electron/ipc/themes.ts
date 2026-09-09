import { ipcMain } from "electron";
import type { ThemeServiceImpl } from "../services/theme-service.js";
import type { PortfolioThemeName, ThemeColorConfig } from "../../../../packages/shared/types/index.js";
import { PortfolioThemeNameSchema, ThemeColorConfigSchema, validateInput } from "../../../../packages/shared/schemas/index.js";

export function registerThemeHandlers(themeService: ThemeServiceImpl): void {
  ipcMain.handle("themes:list", () => {
    return themeService.listThemes();
  });

  ipcMain.handle("themes:getActive", () => {
    return themeService.getActiveThemeName();
  });

  ipcMain.handle("themes:setActive", (_event, name: PortfolioThemeName) => {
    validateInput(PortfolioThemeNameSchema, name);
    themeService.setActiveTheme(name);
    return true;
  });

  ipcMain.handle("themes:getCustomColors", () => {
    return themeService.getCustomColors();
  });

  ipcMain.handle("themes:setCustomColors", (_event, colors: Partial<ThemeColorConfig>) => {
    const validated = validateInput(ThemeColorConfigSchema.partial(), colors);
    themeService.setCustomColors(validated);
    return true;
  });
}
