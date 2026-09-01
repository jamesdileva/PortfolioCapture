import type { AssetRepository } from "../../../../packages/database/repositories/asset-repository.js";
import type {
  MediaAsset,
  AssetType,
  CreateAssetInput,
} from "../../../../packages/shared/types/index.js";

export class AssetService {
  constructor(private repo: AssetRepository) {}

  create(input: CreateAssetInput): MediaAsset {
    if (!input.sessionId) throw new Error("Session ID is required");
    if (!input.projectId) throw new Error("Project ID is required");
    if (!input.type) throw new Error("Asset type is required");
    if (!input.path) throw new Error("Asset path is required");
    return this.repo.create(input);
  }

  getById(id: string): MediaAsset | null {
    if (!id) throw new Error("Asset ID is required");
    return this.repo.getById(id);
  }

  listByProject(projectId: string): MediaAsset[] {
    if (!projectId) throw new Error("Project ID is required");
    return this.repo.listByProject(projectId);
  }

  listBySession(sessionId: string): MediaAsset[] {
    if (!sessionId) throw new Error("Session ID is required");
    return this.repo.listBySession(sessionId);
  }

  listByType(projectId: string, type: AssetType): MediaAsset[] {
    if (!projectId) throw new Error("Project ID is required");
    if (!type) throw new Error("Asset type is required");
    return this.repo.listByType(projectId, type);
  }

  delete(id: string): boolean {
    if (!id) throw new Error("Asset ID is required");
    const existing = this.repo.getById(id);
    if (!existing) throw new Error(`Asset ${id} not found`);
    return this.repo.delete(id);
  }
}
