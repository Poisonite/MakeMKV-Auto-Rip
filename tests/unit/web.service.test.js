import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the ws module to avoid real WebSocket server
vi.mock("ws", () => {
  class WebSocketServerMock {
    constructor() {
      this.clients = new Set();
      this._handlers = {};
    }
    on(event, handler) {
      this._handlers[event] = handler;
    }
  }
  return { WebSocketServer: WebSocketServerMock };
});

// Silence logger output during tests
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    plain: vi.fn(),
    separator: vi.fn(),
    header: vi.fn(),
    headerAlt: vi.fn(),
    underline: vi.fn(),
  },
}));

import { WebService } from "../../src/web/web.service.js";

describe("WebService - constructor", () => {
  const originalPort = process.env.PORT;

  beforeEach(() => {
    // Ensure a clean env for each test
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env.PORT = originalPort;
  });

  it("uses default port 3000 when PORT is not set", () => {
    const svc = new WebService();
    expect(svc.port).toBe(3000);
    expect(svc.isRunning).toBe(false);
    expect(svc.app).toBeTruthy();
  });
});

describe("WebService - start/stop and routing", () => {
  let svc;

  beforeEach(() => {
    process.env.PORT = "0"; // ask OS to pick an open port
    svc = new WebService();
  });

  afterEach(async () => {
    if (svc && svc.isRunning) {
      await svc.stop();
    }
  });

  it("starts server, sets up websocket, serves routes, and reports status", async () => {
    await svc.start();

    // is running and websocket configured
    expect(svc.isRunning).toBe(true);
    expect(svc.wss).toBeTruthy();
    expect(typeof svc.wss._handlers?.connection).toBe("function");

    // Determine actual ephemeral port
    const addr = svc.server.address();
    const port =
      typeof addr === "object" ? addr.port : Number(process.env.PORT);

    // Basic routes should serve HTML
    const base = `http://127.0.0.1:${port}`;
    const resRoot = await fetch(`${base}/`);
    expect(resRoot.ok).toBe(true);
    const textRoot = await resRoot.text();
    expect(textRoot).toMatch(/<html|<!DOCTYPE/i);

    const resConfig = await fetch(`${base}/config`);
    expect(resConfig.ok).toBe(true);
    const textConfig = await resConfig.text();
    expect(textConfig).toMatch(/<html|<!DOCTYPE/i);

    const resConfigHtml = await fetch(`${base}/config.html`);
    expect(resConfigHtml.ok).toBe(true);

    // getStatus reflects connection count
    let status = svc.getStatus();
    expect(status.isRunning).toBe(true);
    expect(status.connections).toBe(0);

    // Simulate a connected client
    svc.wss.clients.add({});
    status = svc.getStatus();
    expect(status.connections).toBe(1);
  });

  it("stops server and updates state", async () => {
    await svc.start();
    await svc.stop();
    expect(svc.isRunning).toBe(false);
  });

  it("serves static assets from /static", async () => {
    await svc.start();
    const addr = svc.server.address();
    const port =
      typeof addr === "object" ? addr.port : Number(process.env.PORT);
    const base = `http://127.0.0.1:${port}`;

    const resJs = await fetch(`${base}/static/js/app.js`);
    expect(resJs.ok).toBe(true);
    const jsText = await resJs.text();
    expect(jsText.length).toBeGreaterThan(0);

    const resCss = await fetch(`${base}/static/css/styles.css`);
    expect(resCss.ok).toBe(true);
  });

  it("can be stopped multiple times without error", async () => {
    await svc.start();
    await svc.stop();
    // second stop should no-op
    await svc.stop();
    expect(svc.isRunning).toBe(false);
  });

  it("getStatus returns sane defaults before start", () => {
    const status = svc.getStatus();
    expect(status.isRunning).toBe(false);
    expect(status.connections).toBe(0);
    expect(
      typeof status.port === "number" || typeof status.port === "string"
    ).toBe(true);
  });

  it("propagates errors from listen during start", async () => {
    // Replace listen with a failing implementation
    const err = new Error("listen failed");
    const spy = vi.spyOn(svc, "listen").mockRejectedValue(err);
    await expect(svc.start()).rejects.toThrow(/listen failed/);
    expect(svc.isRunning).toBe(false);
    spy.mockRestore();
  });
});
