import * as path from "path";

const DANGEROUS_PATTERNS = [
  /\.\./,
  /\.\.\\/,
  /%2e%2e/i,
  /%252e%252e/i,
  /\.\.%2f/i,
  /\.\.%5c/i,
];

const ABSOLUTE_PATH_PATTERNS = [
  /^[A-Za-z]:\\/,
  /^\\\\/,
  /^\/\//,
  /^\/[^\/]/,
];

export function sanitizeFilePath(
  filePath: string,
  allowedBaseDirs?: string[]
): { valid: boolean; sanitized?: string; error?: string } {
  if (!filePath || typeof filePath !== "string") {
    return { valid: false, error: "Path must be a non-empty string" };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(filePath)) {
      return { valid: false, error: "Path contains directory traversal" };
    }
  }

  let normalized: string;
  try {
    normalized = path.normalize(filePath);
  } catch {
    return { valid: false, error: "Path cannot be normalized" };
  }

  if (allowedBaseDirs && allowedBaseDirs.length > 0) {
    const resolved = path.resolve(normalized);
    const isAllowed = allowedBaseDirs.some((base) => {
      const resolvedBase = path.resolve(base);
      return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;
    });

    if (!isAllowed) {
      return { valid: false, error: "Path is outside allowed directories" };
    }
  }

  return { valid: true, sanitized: normalized };
}

export function sanitizeProjectPath(
  projectPath: string
): { valid: boolean; sanitized?: string; error?: string } {
  return sanitizeFilePath(projectPath);
}

export function validateAbsolutePath(
  filePath: string
): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== "string") {
    return { valid: false, error: "Path must be a non-empty string" };
  }

  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    if (pattern.test(filePath)) {
      return { valid: true };
    }
  }

  return { valid: false, error: "Path is not an absolute path" };
}

export function isPathWithinDirectory(
  filePath: string,
  directory: string
): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(directory);
  return (
    resolvedFile.startsWith(resolvedDir + path.sep) ||
    resolvedFile === resolvedDir
  );
}

export function stripTraversal(pathStr: string): string {
  return pathStr
    .replace(/\.\.\//g, "")
    .replace(/\.\.\\/g, "")
    .replace(/\.\./g, "");
}
