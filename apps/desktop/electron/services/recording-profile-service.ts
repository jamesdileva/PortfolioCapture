import { randomUUID } from "crypto";
import type {
  RecordingProfile,
  RecordingProfileSettings,
  ProfilePresetName,
  CreateProfileInput,
  UpdateProfileInput,
} from "../../../../packages/shared/types/index.js";
import type { SettingsService } from "./settings-service.js";

const PROFILES_KEY = "recording-profiles";

const DEFAULT_SETTINGS: RecordingProfileSettings = {
  fps: 30,
  width: 1920,
  height: 1080,
  audio: "none",
  idleTimeoutMs: 15000,
  minIdleDurationMs: 5000,
  maxScreenshots: 5,
  demoTargetDurationMs: 60000,
  demoMinDurationMs: 30000,
  demoMaxDurationMs: 90000,
  screenshotsOnly: false,
};

const PRESETS: Array<{
  presetName: ProfilePresetName;
  name: string;
  description: string;
  settings: Partial<RecordingProfileSettings>;
}> = [
  {
    presetName: "quick_demo",
    name: "Quick Demo",
    description: "Short demo at lower quality, fast turnaround",
    settings: {
      fps: 30,
      width: 1280,
      height: 720,
      audio: "none",
      idleTimeoutMs: 10000,
      minIdleDurationMs: 3000,
      maxScreenshots: 3,
      demoTargetDurationMs: 30000,
      demoMinDurationMs: 15000,
      demoMaxDurationMs: 60000,
    },
  },
  {
    presetName: "portfolio_demo",
    name: "Portfolio Demo",
    description: "Balanced quality demo for portfolio showcase",
    settings: {
      fps: 30,
      width: 1920,
      height: 1080,
      audio: "none",
      idleTimeoutMs: 15000,
      minIdleDurationMs: 5000,
      maxScreenshots: 5,
      demoTargetDurationMs: 60000,
      demoMinDurationMs: 30000,
      demoMaxDurationMs: 90000,
    },
  },
  {
    presetName: "long_session",
    name: "Long Session",
    description: "Extended recording with moderate trimming",
    settings: {
      fps: 30,
      width: 1920,
      height: 1080,
      audio: "none",
      idleTimeoutMs: 20000,
      minIdleDurationMs: 8000,
      maxScreenshots: 10,
      demoTargetDurationMs: 120000,
      demoMinDurationMs: 60000,
      demoMaxDurationMs: 180000,
    },
  },
  {
    presetName: "screenshot_only",
    name: "Screenshot Only",
    description: "Capture screenshots without video recording",
    settings: {
      fps: 30,
      width: 1920,
      height: 1080,
      audio: "none",
      idleTimeoutMs: 15000,
      minIdleDurationMs: 5000,
      maxScreenshots: 20,
      demoTargetDurationMs: 0,
      demoMinDurationMs: 0,
      demoMaxDurationMs: 0,
      screenshotsOnly: true,
    },
  },
  {
    presetName: "manual",
    name: "Manual",
    description: "Full quality recording with system audio, no idle trimming",
    settings: {
      fps: 30,
      width: 1920,
      height: 1080,
      audio: "system",
      idleTimeoutMs: 0,
      minIdleDurationMs: 0,
      maxScreenshots: 5,
      demoTargetDurationMs: 60000,
      demoMinDurationMs: 30000,
      demoMaxDurationMs: 90000,
    },
  },
];

function mergeSettings(base: RecordingProfileSettings, overrides: Partial<RecordingProfileSettings>): RecordingProfileSettings {
  return { ...base, ...overrides };
}

function nowISO(): string {
  return new Date().toISOString();
}

export class RecordingProfileServiceImpl {
  private profiles: RecordingProfile[];
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
    this.profiles = this.loadProfiles();
  }

  list(): RecordingProfile[] {
    return [...this.profiles];
  }

  getById(id: string): RecordingProfile | null {
    return this.profiles.find((p) => p.id === id) ?? null;
  }

  create(input: CreateProfileInput): RecordingProfile {
    const id = randomUUID();
    const ts = nowISO();
    const profile: RecordingProfile = {
      id,
      name: input.name,
      description: input.description ?? "",
      isPreset: false,
      presetName: input.presetName ?? null,
      settings: mergeSettings(DEFAULT_SETTINGS, input.settings),
      createdAt: ts,
      updatedAt: ts,
    };
    this.profiles.push(profile);
    this.saveProfiles();
    return profile;
  }

  update(id: string, input: UpdateProfileInput): RecordingProfile {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile ${id} not found`);
    }
    const existing = this.profiles[idx];
    const updated: RecordingProfile = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      settings: input.settings ? mergeSettings(existing.settings, input.settings) : existing.settings,
      updatedAt: nowISO(),
    };
    this.profiles[idx] = updated;
    this.saveProfiles();
    return updated;
  }

  delete(id: string): void {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile ${id} not found`);
    }
    if (this.profiles[idx].isPreset) {
      throw new Error(`Cannot delete preset profile ${id}`);
    }
    this.profiles.splice(idx, 1);
    this.saveProfiles();
  }

  getPreset(presetName: ProfilePresetName): RecordingProfile {
    const existing = this.profiles.find((p) => p.presetName === presetName && p.isPreset);
    if (existing) {
      return existing;
    }
    const preset = PRESETS.find((p) => p.presetName === presetName);
    if (!preset) {
      throw new Error(`Preset ${presetName} not found`);
    }
    const id = `preset:${presetName}`;
    const ts = nowISO();
    const profile: RecordingProfile = {
      id,
      name: preset.name,
      description: preset.description,
      isPreset: true,
      presetName: preset.presetName,
      settings: mergeSettings(DEFAULT_SETTINGS, preset.settings),
      createdAt: ts,
      updatedAt: ts,
    };
    this.profiles.push(profile);
    this.saveProfiles();
    return profile;
  }

  getSettingsForProfile(id: string): RecordingProfileSettings {
    const profile = this.getById(id);
    if (!profile) {
      throw new Error(`Profile ${id} not found`);
    }
    return { ...profile.settings };
  }

  private loadProfiles(): RecordingProfile[] {
    const raw = this.settingsService.get(PROFILES_KEY);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as RecordingProfile[];
    } catch {
      return [];
    }
  }

  private saveProfiles(): void {
    this.settingsService.set(PROFILES_KEY, JSON.stringify(this.profiles));
  }
}
