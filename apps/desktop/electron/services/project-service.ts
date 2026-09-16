import type { ProjectRepository } from "../../../../packages/database/repositories/project-repository.js";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
} from "../../../../packages/shared/types/index.js";
import { rmSync } from "fs";
import { resolve, sep } from "path";

export interface ProjectServiceOptions {
  /** Project recording folders under this root are removed on delete. Omit to keep files. */
  recordingsRoot?: string;
}

export class ProjectService {
  constructor(
    private repo: ProjectRepository,
    private options?: ProjectServiceOptions,
  ) {}

  list(): Project[] {
    return this.repo.list();
  }

  getById(id: string): Project | null {
    if (!id) throw new Error("Project ID is required");
    return this.repo.getById(id);
  }

  create(input: CreateProjectInput): Project {
    if (!input.name?.trim()) throw new Error("Project name is required");
    if (!input.path?.trim()) throw new Error("Project path is required");
    return this.repo.create(input);
  }

  update(id: string, input: UpdateProjectInput): Project | null {
    if (!id) throw new Error("Project ID is required");
    const existing = this.repo.getById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    return this.repo.update(id, input);
  }

  delete(id: string): boolean {
    if (!id) throw new Error("Project ID is required");
    const existing = this.repo.getById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const deleted = this.repo.deleteCascade(id);
    if (this.options?.recordingsRoot) {
      const resolvedRoot = resolve(this.options.recordingsRoot);
      const resolvedTarget = resolve(resolvedRoot, id);
      if (resolvedTarget !== resolvedRoot && resolvedTarget.startsWith(resolvedRoot + sep)) {
        try {
          rmSync(resolvedTarget, { recursive: true, force: true });
        } catch {
          // Disk cleanup is best-effort; the DB delete already succeeded.
        }
      }
    }
    return deleted;
  }
}
