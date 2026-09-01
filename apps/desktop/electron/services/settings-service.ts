import type { SettingsRepository } from "../../../../packages/database/repositories/settings-repository.js";
import type { Settings } from "../../../../packages/shared/types/index.js";

export class SettingsService {
  constructor(private repo: SettingsRepository) {}

  get(key: string): string | null {
    return this.repo.get(key);
  }

  set(key: string, value: string): void {
    this.repo.set(key, value);
  }

  getAll(): Settings[] {
    return this.repo.getAll();
  }

  delete(key: string): boolean {
    return this.repo.delete(key);
  }
}
