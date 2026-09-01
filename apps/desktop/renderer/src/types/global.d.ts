/// <reference types="vite/client" />

interface PortfolioAPI {
  projects: {
    list: () => Promise<unknown[]>;
    create: (input: unknown) => Promise<unknown>;
    update: (id: string, input: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  sessions: {
    start: (projectId: string) => Promise<unknown>;
    stop: (sessionId: string) => Promise<void>;
    list: (projectId?: string) => Promise<unknown[]>;
  };
  settings: {
    get: () => Promise<Record<string, unknown>>;
    update: (input: unknown) => Promise<void>;
  };
}

declare global {
  interface Window {
    portfolio: PortfolioAPI;
  }
}
