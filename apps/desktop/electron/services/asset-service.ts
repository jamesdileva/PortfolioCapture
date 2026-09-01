import type { AssetRepository } from "../../../../packages/database/repositories/asset-repository.js";
import type {
  MediaAsset,
  AssetType,
  CreateAssetInput,
} from "../../../../packages/shared/types/index.js";

export class AssetService {
  constructor(private repo: AssetRepository) {}

  create(input: CreateAssetInput): MediaAsset {
    return this.repo.create(input);
  }

  getById(id: string): MediaAsset | null {
    return this.repo.getById(id);
  }

  listByProject(projectId: string): MediaAsset[] {
    return this.repo.listByProject(projectId);
  }

  listBySession(sessionId: string): MediaAsset[] {
    return this.repo.listBySession(sessionId);
  }

  listByType(projectId: string, type: AssetType): MediaAsset[] {
    return this.repo.listByType(projectId, type);
  }

  delete(id: string): boolean {
    return this.repo.delete(id);
  }
}
