import type {
  PortfolioThemeName,
  PortfolioThemeConfig,
  ThemeColorConfig,
} from "../../../../packages/shared/types/index.js";
import type { SettingsService } from "./settings-service.js";

const THEME_KEY = "portfolio:theme";
const CUSTOM_COLORS_KEY = "portfolio:customColors";

const BUILTIN_THEMES: Record<PortfolioThemeName, PortfolioThemeConfig> = {
  minimal: {
    name: "minimal",
    label: "Minimal",
    colors: {
      background: "#ffffff",
      surface: "#f8f9fa",
      text: "#1a1a1a",
      textMuted: "#6c757d",
      accent: "#0d6efd",
      border: "#dee2e6",
      statusActive: "#198754",
      statusCompleted: "#0d6efd",
      statusPaused: "#ffc107",
    },
    fontFamily: "system-ui, sans-serif",
    borderRadius: "0",
    gridColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    cardStyle: "flat",
  },
  developer: {
    name: "developer",
    label: "Developer",
    colors: {
      background: "#0d1117",
      surface: "#161b22",
      text: "#e6edf3",
      textMuted: "#8b949e",
      accent: "#58a6ff",
      border: "#30363d",
      statusActive: "#3fb950",
      statusCompleted: "#58a6ff",
      statusPaused: "#d29922",
    },
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    borderRadius: "6px",
    gridColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    cardStyle: "bordered",
  },
  dark: {
    name: "dark",
    label: "Dark",
    colors: {
      background: "#121212",
      surface: "#1e1e1e",
      text: "#e0e0e0",
      textMuted: "#9e9e9e",
      accent: "#bb86fc",
      border: "#2d2d2d",
      statusActive: "#66bb6a",
      statusCompleted: "#42a5f5",
      statusPaused: "#ffa726",
    },
    fontFamily: "system-ui, sans-serif",
    borderRadius: "8px",
    gridColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    cardStyle: "elevated",
  },
  grid: {
    name: "grid",
    label: "Grid",
    colors: {
      background: "#1a1a2e",
      surface: "#16213e",
      text: "#eaeaea",
      textMuted: "#a8a8b3",
      accent: "#e94560",
      border: "#0f3460",
      statusActive: "#00b4d8",
      statusCompleted: "#e94560",
      statusPaused: "#fca311",
    },
    fontFamily: "system-ui, sans-serif",
    borderRadius: "4px",
    gridColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    cardStyle: "bordered",
  },
  resume: {
    name: "resume",
    label: "Resume",
    colors: {
      background: "#fafafa",
      surface: "#ffffff",
      text: "#212121",
      textMuted: "#757575",
      accent: "#1565c0",
      border: "#e0e0e0",
      statusActive: "#2e7d32",
      statusCompleted: "#1565c0",
      statusPaused: "#f57f17",
    },
    fontFamily: "Georgia, 'Times New Roman', serif",
    borderRadius: "2px",
    gridColumns: "1fr",
    cardStyle: "flat",
  },
};

export class ThemeServiceImpl {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  getTheme(name: PortfolioThemeName): PortfolioThemeConfig {
    const theme = BUILTIN_THEMES[name];
    if (!theme) throw new Error(`Unknown theme: ${name}`);
    const customColors = this.getCustomColors();
    if (Object.keys(customColors).length > 0) {
      return { ...theme, colors: { ...theme.colors, ...customColors } };
    }
    return theme;
  }

  listThemes(): PortfolioThemeConfig[] {
    return Object.values(BUILTIN_THEMES);
  }

  getActiveThemeName(): PortfolioThemeName {
    const stored = this.settingsService.get(THEME_KEY);
    if (stored && stored in BUILTIN_THEMES) return stored as PortfolioThemeName;
    return "developer";
  }

  setActiveTheme(name: PortfolioThemeName): void {
    if (!(name in BUILTIN_THEMES)) throw new Error(`Unknown theme: ${name}`);
    this.settingsService.set(THEME_KEY, name);
  }

  getCustomColors(): Partial<ThemeColorConfig> {
    const raw = this.settingsService.get(CUSTOM_COLORS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Partial<ThemeColorConfig>;
    } catch {
      return {};
    }
  }

  setCustomColors(colors: Partial<ThemeColorConfig>): void {
    this.settingsService.set(CUSTOM_COLORS_KEY, JSON.stringify(colors));
  }
}
