import type { ProjectRepository } from "../../../../packages/database/repositories/project-repository.js";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
} from "../../../../packages/shared/types/index.js";

export class ProjectService {
  constructor(private repo: ProjectRepository) {}

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
    return this.repo.delete(id);
  }
}
