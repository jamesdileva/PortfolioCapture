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
    return this.repo.getById(id);
  }

  create(input: CreateProjectInput): Project {
    return this.repo.create(input);
  }

  update(id: string, input: UpdateProjectInput): Project | null {
    return this.repo.update(id, input);
  }

  delete(id: string): boolean {
    return this.repo.delete(id);
  }
}
