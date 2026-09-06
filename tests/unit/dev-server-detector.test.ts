import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DevServerDetectorImpl, type HttpFetchFn } from "../../apps/desktop/electron/services/dev-server-detector.js";

function createMockFetch(responses: Map<number, { ok: boolean; status: number }>): HttpFetchFn {
  return async (url: string) => {
    const match = url.match(/localhost:(\d+)/);
    const port = match ? parseInt(match[1], 10) : 0;
    const res = responses.get(port) ?? { ok: false, status: 0 };
    return res;
  };
}

describe("DevServerDetectorImpl", () => {
  let detector: DevServerDetectorImpl;

  afterEach(() => {
    detector?.stop();
  });

  it("starts and stops cleanly", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000], pollIntervalMs: 100, requestTimeoutMs: 200 },
      createMockFetch(new Map([[3000, { ok: false, status: 0 }]]))
    );
    await detector.start();
    expect(detector.getActiveServers()).toEqual([]);
    detector.stop();
  });

  it("does not start twice", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000], pollIntervalMs: 100, requestTimeoutMs: 200 },
      createMockFetch(new Map([[3000, { ok: false, status: 0 }]]))
    );
    await detector.start();
    await detector.start();
    detector.stop();
  });

  it("detects running dev server on start", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [5173], pollIntervalMs: 100, requestTimeoutMs: 200 },
      createMockFetch(new Map([[5173, { ok: true, status: 200 }]]))
    );

    await detector.start();

    expect(detector.getActiveServers()).toHaveLength(1);
    expect(detector.getActiveServers()[0].port).toBe(5173);
  });

  it("detects dev server not running", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000], pollIntervalMs: 100, requestTimeoutMs: 200 },
      createMockFetch(new Map([[3000, { ok: false, status: 0 }]]))
    );

    await detector.start();
    expect(detector.getActiveServers()).toHaveLength(0);
  });

  it("detects dev server start via poll", async () => {
    let serverRunning = false;
    const fetchFn: HttpFetchFn = async (url) => {
      const match = url.match(/localhost:(\d+)/);
      const port = match ? parseInt(match[1], 10) : 0;
      if (port === 5173 && serverRunning) return { ok: true, status: 200 };
      return { ok: false, status: 0 };
    };

    detector = new DevServerDetectorImpl(
      { ports: [5173], pollIntervalMs: 50, requestTimeoutMs: 100 },
      fetchFn
    );

    const started: Array<{ port: number }> = [];
    detector.onDevServerStarted((info) => started.push(info));

    await detector.start();
    expect(started).toHaveLength(0);

    serverRunning = true;
    await detector.poll();

    expect(started).toHaveLength(1);
    expect(started[0].port).toBe(5173);
  });

  it("detects dev server stop via poll", async () => {
    let serverRunning = true;
    const fetchFn: HttpFetchFn = async (url) => {
      const match = url.match(/localhost:(\d+)/);
      const port = match ? parseInt(match[1], 10) : 0;
      if (port === 3000 && serverRunning) return { ok: true, status: 200 };
      return { ok: false, status: 0 };
    };

    detector = new DevServerDetectorImpl(
      { ports: [3000], pollIntervalMs: 50, requestTimeoutMs: 100 },
      fetchFn
    );

    const stopped: Array<{ port: number }> = [];
    detector.onDevServerStopped((info) => stopped.push(info));

    await detector.start();
    expect(stopped).toHaveLength(0);
    expect(detector.getActiveServers()).toHaveLength(1);

    serverRunning = false;
    await detector.poll();

    expect(stopped).toHaveLength(1);
    expect(stopped[0].port).toBe(3000);
    expect(detector.getActiveServers()).toHaveLength(0);
  });

  it("scans multiple ports concurrently", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000, 5173, 8000], pollIntervalMs: 100, requestTimeoutMs: 200 },
      createMockFetch(
        new Map([
          [3000, { ok: true, status: 200 }],
          [5173, { ok: false, status: 0 }],
          [8000, { ok: true, status: 200 }],
        ])
      )
    );

    await detector.start();
    const active = detector.getActiveServers();
    expect(active).toHaveLength(2);
    expect(active.map((s) => s.port).sort()).toEqual([3000, 8000]);
  });

  it("matches project by devServerPorts", () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000, 5173] },
      createMockFetch(new Map())
    );

    detector.setProjects([
      { id: "p1", devServerPorts: [3000], name: "Frontend" },
      { id: "p2", devServerPorts: [8000], name: "Backend" },
    ]);

    expect(detector.matchProject(3000)).toEqual({ id: "p1", name: "Frontend" });
    expect(detector.matchProject(8000)).toEqual({ id: "p2", name: "Backend" });
    expect(detector.matchProject(9999)).toBeNull();
  });

  it("returns null match when no projects configured", () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000] },
      createMockFetch(new Map())
    );
    expect(detector.matchProject(3000)).toBeNull();
  });

  it("fires started callback with matched project on poll", async () => {
    let serverRunning = false;
    const fetchFn: HttpFetchFn = async (url) => {
      const match = url.match(/localhost:(\d+)/);
      const port = match ? parseInt(match[1], 10) : 0;
      if (port === 5173 && serverRunning) return { ok: true, status: 200 };
      return { ok: false, status: 0 };
    };

    detector = new DevServerDetectorImpl(
      { ports: [5173], pollIntervalMs: 50, requestTimeoutMs: 100 },
      fetchFn
    );

    detector.setProjects([
      { id: "p1", devServerPorts: [5173], name: "MyApp" },
    ]);

    let matchedProject: { id: string; name: string } | null = null;
    detector.onDevServerStarted((_info, project) => {
      matchedProject = project;
    });

    await detector.start();
    serverRunning = true;
    await detector.poll();

    expect(matchedProject).toEqual({ id: "p1", name: "MyApp" });
  });

  it("uses custom config", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [4000], pollIntervalMs: 200, requestTimeoutMs: 500 },
      createMockFetch(new Map([[4000, { ok: true, status: 200 }]]))
    );

    await detector.start();
    expect(detector.getActiveServers()).toHaveLength(1);
    expect(detector.getActiveServers()[0].port).toBe(4000);
  });

  it("handles fetch errors gracefully", async () => {
    const errorFetch: HttpFetchFn = async () => {
      throw new Error("network error");
    };

    detector = new DevServerDetectorImpl(
      { ports: [3000], pollIntervalMs: 100, requestTimeoutMs: 200 },
      errorFetch
    );

    await detector.start();
    expect(detector.getActiveServers()).toHaveLength(0);
  });

  it("returns correct url format on poll", async () => {
    let serverRunning = false;
    const fetchFn: HttpFetchFn = async (url) => {
      const match = url.match(/localhost:(\d+)/);
      const port = match ? parseInt(match[1], 10) : 0;
      if (port === 5173 && serverRunning) return { ok: true, status: 200 };
      return { ok: false, status: 0 };
    };

    detector = new DevServerDetectorImpl(
      { ports: [5173], pollIntervalMs: 50, requestTimeoutMs: 100 },
      fetchFn
    );

    let detectedUrl = "";
    detector.onDevServerStarted((info) => {
      detectedUrl = info.url;
    });

    await detector.start();
    serverRunning = true;
    await detector.poll();

    expect(detectedUrl).toBe("http://localhost:5173");
  });

  it("poll returns current server states", async () => {
    detector = new DevServerDetectorImpl(
      { ports: [3000, 5173], pollIntervalMs: 100, requestTimeoutMs: 200 },
      createMockFetch(
        new Map([
          [3000, { ok: true, status: 200 }],
          [5173, { ok: false, status: 0 }],
        ])
      )
    );

    const results = await detector.poll();
    expect(results).toHaveLength(2);
    const port3000 = results.find((r) => r.port === 3000);
    const port5173 = results.find((r) => r.port === 5173);
    expect(port3000?.isRunning).toBe(true);
    expect(port5173?.isRunning).toBe(false);
  });
});
