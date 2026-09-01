import type { SettingsRepository } from "../../../../packages/database/repositories/settings-repository.js";
import type { Settings } from "../../../../packages/shared/types/index.js";

export class SettingsService {
  constructor(private repo: SettingsRepository) {}

  get(key: string): string | null {
    if (!key) throw new Error("Setting key is required");
    return this.repo.get(key);
  }

  set(key: string, value: string): void {
    if (!key) throw new Error("Setting key is required");
    this.repo.set(key, value);
  }

  getAll(): Settings[] {
    return this.repo.getAll();
  }

  delete(key: string): boolean {
    if (!key) throw new Error("Setting key is required");
    return this.repo.delete(key);
  }
}
