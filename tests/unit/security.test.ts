import { describe, it, expect, vi } from "vitest";
import {
  buildCspHeader,
  buildSecurityHeaders,
  installCspHeaders,
} from "../../apps/desktop/electron/security/csp.js";
import {
  ALLOWED_IPC_CHANNELS,
  isChannelAllowed,
  getAllowedChannels,
} from "../../apps/desktop/electron/security/ipc-allowlist.js";
import {
  sanitizeFilePath,
  sanitizeProjectPath,
  validateAbsolutePath,
  isPathWithinDirectory,
  stripTraversal,
} from "../../apps/desktop/electron/security/path-sanitize.js";

describe("CSP Module", () => {
  describe("buildCspHeader", () => {
    it("returns default CSP header with all directives", () => {
      const header = buildCspHeader();
      expect(header).toContain("default-src 'self'");
      expect(header).toContain("script-src 'self'");
      expect(header).toContain("style-src 'self' 'unsafe-inline'");
      expect(header).toContain("img-src 'self' data: blob:");
      expect(header).toContain("connect-src 'self'");
      expect(header).toContain("object-src 'none'");
      expect(header).toContain("frame-src 'none'");
    });

    it("joins directives with semicolons", () => {
      const header = buildCspHeader();
      expect(header).toContain("; ");
    });

    it("allows overriding directives", () => {
      const header = buildCspHeader({
        directives: {
          "script-src": ["'self'", "'unsafe-eval'"],
        },
      });
      expect(header).toContain("script-src 'self' 'unsafe-eval'");
    });

    it("allows removing directives with undefined", () => {
      const header = buildCspHeader({
        directives: {
          "frame-src": undefined as unknown as string[],
        },
      });
      expect(header).not.toContain("frame-src");
    });

    it("preserves other directives when overriding one", () => {
      const header = buildCspHeader({
        directives: {
          "script-src": ["'self'", "'unsafe-eval'"],
        },
      });
      expect(header).toContain("default-src 'self'");
      expect(header).toContain("connect-src 'self'");
    });
  });

  describe("buildSecurityHeaders", () => {
    it("returns all security headers", () => {
      const headers = buildSecurityHeaders();
      expect(headers["Content-Security-Policy"]).toBeTruthy();
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["X-Frame-Options"]).toBe("DENY");
      expect(headers["Referrer-Policy"]).toBe("no-referrer");
    });

    it("CSP header includes default-src", () => {
      const headers = buildSecurityHeaders();
      expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    });

    it("accepts custom CSP config", () => {
      const headers = buildSecurityHeaders({
        directives: {
          "script-src": ["'self'", "'unsafe-eval'"],
        },
      });
      expect(headers["Content-Security-Policy"]).toContain("script-src 'self' 'unsafe-eval'");
    });
  });

  describe("installCspHeaders", () => {
    it("registers onHeadersReceived listener on session", () => {
      const mockOnHeadersReceived = vi.fn();
      const session = {
        webRequest: {
          onHeadersReceived: mockOnHeadersReceived,
        },
      };

      installCspHeaders(session);
      expect(mockOnHeadersReceived).toHaveBeenCalledTimes(1);
      expect(typeof mockOnHeadersReceived.mock.calls[0][0]).toBe("function");
    });

    it("callback sets CSP and security headers", () => {
      let listenerRef: ((details: unknown, cb: (response: { responseHeaders?: Record<string, string[]> }) => void) => void) | undefined;

      const session = {
        webRequest: {
          onHeadersReceived: (listener: (details: unknown, cb: (response: { responseHeaders?: Record<string, string[]> }) => void) => void) => {
            listenerRef = listener;
          },
        },
      };

      installCspHeaders(session);
      expect(listenerRef).toBeDefined();

      let capturedResponse: { responseHeaders?: Record<string, string[]> } = {};
      listenerRef!({}, (r) => { capturedResponse = r; });

      expect(capturedResponse.responseHeaders).toBeDefined();
      expect(capturedResponse.responseHeaders!["Content-Security-Policy"]).toBeDefined();
      expect(capturedResponse.responseHeaders!["X-Content-Type-Options"]).toEqual(["nosniff"]);
      expect(capturedResponse.responseHeaders!["X-Frame-Options"]).toEqual(["DENY"]);
      expect(capturedResponse.responseHeaders!["Referrer-Policy"]).toEqual(["no-referrer"]);
    });

    it("callback CSP header includes script-src", () => {
      let listenerRef: ((details: unknown, cb: (response: { responseHeaders?: Record<string, string[]> }) => void) => void) | undefined;

      const session = {
        webRequest: {
          onHeadersReceived: (listener: (details: unknown, cb: (response: { responseHeaders?: Record<string, string[]> }) => void) => void) => {
            listenerRef = listener;
          },
        },
      };

      installCspHeaders(session);

      let capturedResponse: { responseHeaders?: Record<string, string[]> } = {};
      listenerRef!({ url: "https://localhost:5173/index.html" }, (r) => { capturedResponse = r; });

      const csp = capturedResponse.responseHeaders!["Content-Security-Policy"][0];
      expect(csp).toContain("script-src 'self'");
    });

    it("callback leaves file:// responses untouched (no nosniff — avoids white screen)", () => {
      let listenerRef: ((details: unknown, cb: (response: { responseHeaders?: Record<string, string[]> }) => void) => void) | undefined;

      const session = {
        webRequest: {
          onHeadersReceived: (listener: (details: unknown, cb: (response: { responseHeaders?: Record<string, string[]> }) => void) => void) => {
            listenerRef = listener;
          },
        },
      };

      installCspHeaders(session);

      let capturedResponse: { responseHeaders?: Record<string, string[]> } = { responseHeaders: { "X-Old": ["keep"] } };
      listenerRef!({ url: "file:///C:/app/resources/app.asar/apps/desktop/renderer/dist/assets/index.js" }, (r) => { capturedResponse = r; });

      expect(capturedResponse.responseHeaders).toBeUndefined();
    });
  });
});

describe("IPC Allowlist", () => {
  it("contains all expected channel namespaces", () => {
    const namespaces = new Set(
      ALLOWED_IPC_CHANNELS.map((ch) => ch.split(":")[0])
    );
    expect(namespaces.has("projects")).toBe(true);
    expect(namespaces.has("sessions")).toBe(true);
    expect(namespaces.has("assets")).toBe(true);
    expect(namespaces.has("settings")).toBe(true);
    expect(namespaces.has("profiles")).toBe(true);
    expect(namespaces.has("export")).toBe(true);
    expect(namespaces.has("overrides")).toBe(true);
    expect(namespaces.has("git")).toBe(true);
    expect(namespaces.has("scanner")).toBe(true);
    expect(namespaces.has("feature-evidence")).toBe(true);
    expect(namespaces.has("ai")).toBe(true);
    expect(namespaces.has("portfolio")).toBe(true);
    expect(namespaces.has("themes")).toBe(true);
    expect(namespaces.has("deploy")).toBe(true);
    expect(namespaces.has("devserver")).toBe(true);
    expect(namespaces.has("windows")).toBe(true);
    expect(namespaces.has("chapters")).toBe(true);
    expect(namespaces.has("quality")).toBe(true);
    expect(namespaces.has("crash-recovery")).toBe(true);
    expect(namespaces.has("health")).toBe(true);
  });

  it("contains exactly 81 channels", () => {
    expect(ALLOWED_IPC_CHANNELS.length).toBe(81);
  });

  it("isChannelAllowed returns true for known channels", () => {
    expect(isChannelAllowed("projects:list")).toBe(true);
    expect(isChannelAllowed("sessions:start")).toBe(true);
    expect(isChannelAllowed("quality:score")).toBe(true);
    expect(isChannelAllowed("crash-recovery:detect")).toBe(true);
    expect(isChannelAllowed("crash-recovery:discard")).toBe(true);
    expect(isChannelAllowed("crash-recovery:autoCleanup")).toBe(true);
    expect(isChannelAllowed("health:check")).toBe(true);
  });

  it("isChannelAllowed returns false for unknown channels", () => {
    expect(isChannelAllowed("unknown:channel")).toBe(false);
    expect(isChannelAllowed("fs:read")).toBe(false);
    expect(isChannelAllowed("child_process:exec")).toBe(false);
    expect(isChannelAllowed("")).toBe(false);
  });

  it("isChannelAllowed returns false for injection attempts", () => {
    expect(isChannelAllowed("projects:list; rm -rf /")).toBe(false);
    expect(isChannelAllowed("__proto__:polluted")).toBe(false);
    expect(isChannelAllowed("constructor:prototype")).toBe(false);
  });

  it("getAllowedChannels returns a copy of the list", () => {
    const channels = getAllowedChannels();
    expect(channels.length).toBe(81);
    channels.push("fake:channel");
    expect(ALLOWED_IPC_CHANNELS.length).toBe(81);
  });

  it("ALLOWED_IPC_CHANNELS is readonly (TypeScript)", () => {
    expect(ALLOWED_IPC_CHANNELS).toBeDefined();
  });
});

describe("Path Sanitizer", () => {
  describe("sanitizeFilePath", () => {
    it("accepts normal relative path", () => {
      const result = sanitizeFilePath("src/components/App.tsx");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });

    it("accepts normal absolute path", () => {
      const result = sanitizeFilePath("C:\\Users\\test\\project");
      expect(result.valid).toBe(true);
    });

    it("rejects path with ../", () => {
      const result = sanitizeFilePath("src/../../etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects path with ..\\", () => {
      const result = sanitizeFilePath("src\\..\\..\\etc\\passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects URL-encoded ../", () => {
      const result = sanitizeFilePath("src/%2e%2e/etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects double-encoded ../", () => {
      const result = sanitizeFilePath("src/%252e%252e/etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects empty path", () => {
      const result = sanitizeFilePath("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty");
    });

    it("rejects non-string input", () => {
      const result = sanitizeFilePath(123 as unknown as string);
      expect(result.valid).toBe(false);
    });

    it("enforces allowedBaseDirs constraint", () => {
      const result = sanitizeFilePath(
        "C:\\Users\\test\\project\\src",
        ["C:\\Users\\test\\project"]
      );
      expect(result.valid).toBe(true);
    });

    it("rejects path outside allowedBaseDirs", () => {
      const result = sanitizeFilePath(
        "C:\\Users\\other\\secret",
        ["C:\\Users\\test\\project"]
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside");
    });

    it("accepts path at exact base directory", () => {
      const result = sanitizeFilePath(
        "C:\\Users\\test\\project",
        ["C:\\Users\\test\\project"]
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("sanitizeProjectPath", () => {
    it("delegates to sanitizeFilePath", () => {
      const result = sanitizeProjectPath("C:\\Users\\test\\project");
      expect(result.valid).toBe(true);
    });

    it("rejects traversal in project path", () => {
      const result = sanitizeProjectPath("C:\\Users\\test\\../../../etc");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateAbsolutePath", () => {
    it("accepts Windows absolute path", () => {
      const result = validateAbsolutePath("C:\\Users\\test");
      expect(result.valid).toBe(true);
    });

    it("accepts UNC path", () => {
      const result = validateAbsolutePath("\\\\server\\share");
      expect(result.valid).toBe(true);
    });

    it("accepts forward-slash absolute path", () => {
      const result = validateAbsolutePath("/usr/local/bin");
      expect(result.valid).toBe(true);
    });

    it("rejects relative path", () => {
      const result = validateAbsolutePath("src/components");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not an absolute");
    });

    it("rejects empty path", () => {
      const result = validateAbsolutePath("");
      expect(result.valid).toBe(false);
    });
  });

  describe("isPathWithinDirectory", () => {
    it("returns true for child path", () => {
      expect(isPathWithinDirectory("C:\\project\\src\\App.tsx", "C:\\project")).toBe(true);
    });

    it("returns true for exact match", () => {
      expect(isPathWithinDirectory("C:\\project", "C:\\project")).toBe(true);
    });

    it("returns false for path outside directory", () => {
      expect(isPathWithinDirectory("C:\\other\\file.ts", "C:\\project")).toBe(false);
    });

    it("returns false for sibling directory", () => {
      expect(isPathWithinDirectory("C:\\project2\\file.ts", "C:\\project")).toBe(false);
    });
  });

  describe("stripTraversal", () => {
    it("removes ../ sequences", () => {
      expect(stripTraversal("src/../../etc/passwd")).toBe("src/etc/passwd");
    });

    it("removes ..\\ sequences", () => {
      expect(stripTraversal("src\\..\\..\\etc")).toBe("src\\etc");
    });

    it("removes standalone ..", () => {
      expect(stripTraversal("src/..")).toBe("src/");
    });

    it("leaves clean paths unchanged", () => {
      expect(stripTraversal("src/components/App.tsx")).toBe("src/components/App.tsx");
    });
  });
});
