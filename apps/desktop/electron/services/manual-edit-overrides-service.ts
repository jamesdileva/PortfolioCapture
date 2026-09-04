import type { SettingsService } from "./settings-service.js";
import type { TimelineOverrides } from "../../../../packages/shared/types/index.js";

const SETTINGS_PREFIX = "timeline-overrides:";

const DEFAULT_OVERRIDES: TimelineOverrides = {
  selectedIndices: [],
  removedIndices: [],
  thumbnailTimestampMs: null,
  highlightIndices: [],
  customOrder: null,
};

export class ManualEditOverridesServiceImpl {
  constructor(private settingsService: SettingsService) {}

  getOverrides(sessionId: string): TimelineOverrides {
    if (!sessionId) throw new Error("Session ID is required");

    const raw = this.settingsService.get(`${SETTINGS_PREFIX}${sessionId}`);
    if (!raw) {
      return { ...DEFAULT_OVERRIDES };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<TimelineOverrides>;
      return {
        selectedIndices: Array.isArray(parsed.selectedIndices) ? parsed.selectedIndices : [],
        removedIndices: Array.isArray(parsed.removedIndices) ? parsed.removedIndices : [],
        thumbnailTimestampMs: typeof parsed.thumbnailTimestampMs === "number" ? parsed.thumbnailTimestampMs : null,
        highlightIndices: Array.isArray(parsed.highlightIndices) ? parsed.highlightIndices : [],
        customOrder: Array.isArray(parsed.customOrder) ? parsed.customOrder : null,
      };
    } catch {
      return { ...DEFAULT_OVERRIDES };
    }
  }

  saveOverrides(sessionId: string, overrides: TimelineOverrides): void {
    if (!sessionId) throw new Error("Session ID is required");
    if (!overrides) throw new Error("Overrides are required");

    const sanitized: TimelineOverrides = {
      selectedIndices: Array.isArray(overrides.selectedIndices)
        ? [...overrides.selectedIndices]
        : [],
      removedIndices: Array.isArray(overrides.removedIndices)
        ? [...overrides.removedIndices]
        : [],
      thumbnailTimestampMs:
        typeof overrides.thumbnailTimestampMs === "number"
          ? overrides.thumbnailTimestampMs
          : null,
      highlightIndices: Array.isArray(overrides.highlightIndices)
        ? [...overrides.highlightIndices]
        : [],
      customOrder:
        Array.isArray(overrides.customOrder) ? [...overrides.customOrder] : null,
    };

    this.settingsService.set(`${SETTINGS_PREFIX}${sessionId}`, JSON.stringify(sanitized));
  }

  clearOverrides(sessionId: string): void {
    if (!sessionId) throw new Error("Session ID is required");
    this.settingsService.delete(`${SETTINGS_PREFIX}${sessionId}`);
  }
}
