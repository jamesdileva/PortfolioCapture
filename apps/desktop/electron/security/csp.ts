export interface CspConfig {
  directives: Record<string, string[]>;
  reportOnly: boolean;
}

export interface ElectronSessionLike {
  webRequest: {
    onHeadersReceived: (
      listener: (
        details: unknown,
        callback: (response: { responseHeaders?: Record<string, string[]> }) => void
      ) => void
    ) => void;
  };
}

const DEFAULT_CSP_CONFIG: CspConfig = {
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "media-src": ["'self'", "blob:", "file:"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  },
  reportOnly: false,
};

export function buildCspHeader(config?: Partial<CspConfig>): string {
  const merged = mergeConfig(DEFAULT_CSP_CONFIG, config);
  const parts: string[] = [];

  for (const [directive, sources] of Object.entries(merged.directives)) {
    if (sources.length > 0) {
      parts.push(`${directive} ${sources.join(" ")}`);
    }
  }

  return parts.join("; ");
}

export function buildSecurityHeaders(config?: Partial<CspConfig>): Record<string, string> {
  const cspHeader = buildCspHeader(config);
  return {
    "Content-Security-Policy": cspHeader,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}

export function installCspHeaders(
  session: ElectronSessionLike,
  config?: Partial<CspConfig>
): void {
  const merged = mergeConfig(DEFAULT_CSP_CONFIG, config);
  const cspHeader = buildCspHeader(merged);

  session.webRequest.onHeadersReceived(
    (
      details: unknown,
      callback: (response: { responseHeaders?: Record<string, string[]> }) => void
    ) => {
      const url = (details as { url?: unknown } | null | undefined)?.url;
      if (typeof url === "string" && !url.startsWith("http://") && !url.startsWith("https://")) {
        // Non-network schemes (e.g. file:// for the packaged renderer) carry
        // no MIME type, so X-Content-Type-Options: nosniff would make Chromium
        // refuse to execute module scripts (white screen). Leave the response
        // untouched — index.html's inline <meta> CSP still applies.
        callback({});
        return;
      }
      callback({
        responseHeaders: {
          "Content-Security-Policy": [cspHeader],
          "X-Content-Type-Options": ["nosniff"],
          "X-Frame-Options": ["DENY"],
          "Referrer-Policy": ["no-referrer"],
        },
      });
    }
  );
}

function mergeConfig(
  base: CspConfig,
  override?: Partial<CspConfig>
): CspConfig {
  if (!override) return { ...base, directives: { ...base.directives } };

  const mergedDirectives: Record<string, string[]> = { ...base.directives };

  if (override.directives) {
    for (const [key, value] of Object.entries(override.directives)) {
      if (value === undefined) {
        delete mergedDirectives[key];
      } else {
        mergedDirectives[key] = value;
      }
    }
  }

  return {
    directives: mergedDirectives,
    reportOnly: override.reportOnly ?? base.reportOnly,
  };
}
