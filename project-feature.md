# Feature: Project Auto-Fill

## Summary

When the user enters a project directory path, automatically detect and pre-fill
project metadata (name, description, launch command, tech stack, GitHub URL) by
scanning the directory for package.json, README, git config, and config files.

## User Story

> As a developer, I want to type a project path like
> `C:\Users\j\Projects\Agents\release\win-unpacked\antfarm.exe` and have the
> form auto-fill the name, description, npm start command, and tech stack so I
> don't have to type everything manually.

## Scope

### In Scope

1. **Path → Directory resolution**: If user enters an executable path (`.exe`),
   derive the parent directory as the project root.

2. **Auto-detect fields from project directory**:

   | Field           | Source                                           |
   |-----------------|--------------------------------------------------|
   | Name            | Directory name (last segment of path)            |
   | Description     | README.md first paragraph                        |
   | Launch Command  | `package.json` → `scripts.start` or `scripts.dev`|
   | Tech Stack      | `package.json` deps + config file detection      |
   | GitHub URL      | `git remote get-url origin`                      |
   | Executable Path | Scan for `.exe` files in directory (recursive 1 level) |
   | Features        | (not auto-detected — manual entry)               |

3. **Trigger**: Auto-fill fires when the **Project Path** input loses focus
   (`onBlur`) or when the user clicks a "Detect" button next to the path field.

4. **Non-destructive**: Only fills fields that are currently **empty**. If the
   user has already typed something in a field, it is not overwritten.

5. **Status**: Defaults to `"active"`.

### Out of Scope

- Auto-detecting `devServerPorts` (requires running the dev server to know)
- AI-generated descriptions (deferred to existing LocalAiService integration)
- Auto-detecting project status or enabled/disabled

## Technical Design

### New Service: `ProjectAutoFillService`

```
apps/desktop/electron/services/project-autofill.ts
```

```
class ProjectAutoFillService {
  constructor(
    execFn?: ExecFn,        // injectable for testing
    readFileFn?: ReadFileFn, // injectable for testing
    readdirFn?: ReaddirFn    // injectable for testing
  )

  async detect(path: string): Promise<ProjectAutoFillResult>
}
```

**`detect()` logic:**

1. If `path` ends with `.exe` or other executable extension, use parent directory.
2. Read `package.json` → extract `name`, `description`, `scripts.start`,
   `scripts.dev`, `dependencies`, `devDependencies`.
3. Read `README.md` → extract first non-empty paragraph (skip headers).
4. Run `git remote get-url origin` → extract GitHub URL.
5. Scan directory (1 level deep) for `.exe` files → candidate executable paths.
6. Detect technologies from deps + config files (reuse patterns from
   `ProjectScanner`).

### New Shared Type

```typescript
// In packages/shared/types/index.ts

export interface ProjectAutoFillResult {
  name: string | null;
  description: string | null;
  launchCommand: string | null;
  techStack: string[];
  githubUrl: string | null;
  executablePath: string | null;
  source: "package.json" | "directory" | "git";
}
```

### IPC Channel

```
scanner:autofill → (path: string) => ProjectAutoFillResult
```

### Preload Bridge

```typescript
portfolio.scanner.autofill(path: string): Promise<ProjectAutoFillResult>
```

### Renderer Integration

In `ProjectForm.tsx`:

1. Add `onBlur` handler to **Project Path** input.
2. On blur, call `portfolio.scanner.autofill(path)`.
3. For each returned field, if the corresponding form state is empty, set it.
4. Show a brief "Detected: ..." toast/indicator when fields are populated.
5. Also add a manual "Detect" button next to the path field for explicit trigger.

### Launch Command Detection Priority

1. `scripts.start` → `"npm start"`
2. `scripts.dev` → `"npm run dev"`
3. `scripts.serve` → `"npm run serve"`
4. `scripts.build` + `scripts.preview` → `"npm run preview"`
5. None found → `null` (user enters manually)

### Tech Stack Detection

Reuse detection patterns from existing `ProjectScanner`:
- Deps from `package.json` (react, vue, express, etc.)
- Config files: `tsconfig.json` → TypeScript, `vite.config.*` → Vite,
  `docker-compose.yml` → Docker, etc.

## Files to Create/Modify

| File                                          | Change                              |
|-----------------------------------------------|-------------------------------------|
| `packages/shared/types/index.ts`              | Add `ProjectAutoFillResult` type    |
| `apps/desktop/electron/services/project-autofill.ts` | New service (est. ~120 lines) |
| `apps/desktop/electron/ipc/scanner.ts`        | Add `scanner:autofill` handler      |
| `apps/desktop/electron/preload.ts`            | Add `autofill` to scanner namespace |
| `apps/desktop/renderer/src/types/global.d.ts` | Add `autofill` to PortfolioScannerAPI |
| `apps/desktop/renderer/src/components/ProjectForm.tsx` | Add auto-fill UI + onBlur |
| `apps/desktop/electron/main.ts`               | Wire ProjectAutoFillService         |
| `tests/unit/project-autofill.test.ts`         | Unit tests (est. ~15 tests)         |

## Tests

1. Returns null fields for nonexistent path
2. Detects name from directory name
3. Detects description from README.md (first paragraph)
4. Detects launch command from scripts.start
5. Falls back to scripts.dev when no start
6. Returns null launchCommand when no scripts
7. Detects GitHub URL from git remote
8. Returns null githubUrl when not a git repo
9. Detects tech stack from package.json deps
10. Detects TypeScript from tsconfig.json
11. Detects Vite from vite.config.ts
12. Resolves executable path from directory scan
13. Handles executable path input (derives parent dir)
14. Handles malformed package.json gracefully
15. Handles missing README.md gracefully

## Verification

- [ ] Type a project path → blur → fields auto-populate
- [ ] Type an .exe path → name derived from parent dir
- [ ] Non-destructive: existing fields not overwritten
- [ ] Empty/missing project → no crash, fields stay empty
- [ ] All unit tests pass
- [ ] Build succeeds

## Estimate

**Sprint effort**: Small (~1 session)
- New service: ~120 lines
- IPC + preload wiring: ~20 lines
- ProjectForm UI changes: ~40 lines
- Tests: ~15 tests
