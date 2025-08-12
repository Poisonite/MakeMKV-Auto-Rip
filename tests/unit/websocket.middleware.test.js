import { describe, it, expect, vi, beforeEach } from "vitest";

// Silence logger output during tests and allow assertions on calls
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

class WebSocketMock {
  constructor() {
    this.OPEN = 1;
    this.readyState = this.OPEN;
    this.sent = [];
    this.handlers = {};
    this.shouldThrowOnSend = false;
  }
  on(event, handler) {
    this.handlers[event] = handler;
  }
  send(message) {
    if (this.shouldThrowOnSend) {
      throw new Error("send-fail");
    }
    this.sent.push(String(message));
  }
  trigger(event, data) {
    if (typeof this.handlers[event] === "function") {
      this.handlers[event](data);
    }
  }
}

describe("websocket.middleware - basic connection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("adds connection, sends welcome, and removes on close", async () => {
    const { webSocketHandler, getActiveConnectionCount } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );

    const ws = new WebSocketMock();
    expect(getActiveConnectionCount()).toBe(0);

    webSocketHandler(ws, {});

    // Added and welcome sent
    expect(getActiveConnectionCount()).toBe(1);
    expect(ws.sent.length).toBe(1);
    const welcome = JSON.parse(ws.sent[0]);
    expect(welcome.type).toBe("connected");
    expect(welcome.message).toMatch(/Connected to MakeMKV Auto Rip Web UI/);

    // Close event removes connection
    ws.trigger("close");
    expect(getActiveConnectionCount()).toBe(0);
  });
});

describe("websocket.middleware - message handling", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("responds to ping with pong", async () => {
    const { webSocketHandler } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );
    const ws = new WebSocketMock();
    webSocketHandler(ws, {});

    ws.trigger("message", JSON.stringify({ type: "ping" }));

    const last = JSON.parse(ws.sent.at(-1));
    expect(last.type).toBe("pong");
    expect(typeof last.timestamp).toBe("string");
  });

  it("acknowledges subscribe requests", async () => {
    const { webSocketHandler } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );
    const ws = new WebSocketMock();
    webSocketHandler(ws, {});

    ws.trigger("message", JSON.stringify({ type: "subscribe" }));

    const last = JSON.parse(ws.sent.at(-1));
    expect(last.type).toBe("subscribed");
    expect(last.message).toMatch(/Subscribed/);
  });

  it("handles invalid JSON with error response and log", async () => {
    const { webSocketHandler } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );
    const { Logger } = await import("../../src/utils/logger.js");
    const ws = new WebSocketMock();
    webSocketHandler(ws, {});

    ws.trigger("message", "not-json");

    const last = JSON.parse(ws.sent.at(-1));
    expect(last.type).toBe("error");
    expect(last.message).toMatch(/Invalid message format/);
    expect(Logger.error).toHaveBeenCalledWith(
      "Invalid WebSocket message received",
      expect.any(String)
    );
  });

  it("handles unknown type with warning and error reply", async () => {
    const { webSocketHandler } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );
    const { Logger } = await import("../../src/utils/logger.js");
    const ws = new WebSocketMock();
    webSocketHandler(ws, {});

    ws.trigger("message", JSON.stringify({ type: "unknown_type" }));

    const last = JSON.parse(ws.sent.at(-1));
    expect(last.type).toBe("error");
    expect(last.message).toMatch(/Unknown message type/);
    expect(Logger.warning).toHaveBeenCalledWith(
      "Unknown WebSocket message type",
      "unknown_type"
    );
  });
});

describe("websocket.middleware - broadcasting", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("broadcasts to open clients and includes timestamp", async () => {
    const { webSocketHandler, broadcastToClients } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );

    const a = new WebSocketMock();
    const b = new WebSocketMock();
    webSocketHandler(a, {});
    webSocketHandler(b, {});

    broadcastToClients({ type: "custom", foo: "bar" });

    const msgA = JSON.parse(a.sent.at(-1));
    const msgB = JSON.parse(b.sent.at(-1));
    expect(msgA.type).toBe("custom");
    expect(msgA.foo).toBe("bar");
    expect(typeof msgA.timestamp).toBe("string");
    expect(msgB.type).toBe("custom");
  });

  it("removes clients that error during send", async () => {
    const { webSocketHandler, broadcastToClients, getActiveConnectionCount } =
      await import("../../src/web/middleware/websocket.middleware.js");
    const { Logger } = await import("../../src/utils/logger.js");

    const good = new WebSocketMock();
    const bad = new WebSocketMock();

    webSocketHandler(good, {});
    webSocketHandler(bad, {});

    // Trigger failures only for broadcast, not for initial welcome
    bad.shouldThrowOnSend = true;

    expect(getActiveConnectionCount()).toBe(2);

    broadcastToClients({ type: "note" });

    expect(getActiveConnectionCount()).toBe(1);
    expect(Logger.error).toHaveBeenCalledWith(
      "Failed to send WebSocket message",
      expect.any(String)
    );
  });

  it("removes clients that are not open", async () => {
    const { webSocketHandler, broadcastToClients, getActiveConnectionCount } =
      await import("../../src/web/middleware/websocket.middleware.js");

    const closed = new WebSocketMock();
    closed.readyState = 3; // not OPEN

    webSocketHandler(closed, {});
    expect(getActiveConnectionCount()).toBe(1);

    broadcastToClients({ type: "msg" });

    expect(getActiveConnectionCount()).toBe(0);
  });

  it("handles ws error event by logging and removing", async () => {
    const { webSocketHandler, getActiveConnectionCount } = await import(
      "../../src/web/middleware/websocket.middleware.js"
    );
    const { Logger } = await import("../../src/utils/logger.js");

    const ws = new WebSocketMock();
    webSocketHandler(ws, {});
    expect(getActiveConnectionCount()).toBe(1);

    ws.trigger("error", new Error("boom"));

    expect(Logger.error).toHaveBeenCalledWith(
      "WebSocket error",
      expect.any(String)
    );
    expect(getActiveConnectionCount()).toBe(0);
  });

  it("broadcast helpers send expected shapes", async () => {
    const { webSocketHandler, broadcastStatusUpdate, broadcastLogMessage } =
      await import("../../src/web/middleware/websocket.middleware.js");

    const ws = new WebSocketMock();
    webSocketHandler(ws, {});

    broadcastStatusUpdate("ripping", "disc-1", { progress: 50 });
    const statusMsg = JSON.parse(ws.sent.at(-1));
    expect(statusMsg.type).toBe("status_update");
    expect(statusMsg.status).toBe("ripping");
    expect(statusMsg.operation).toBe("disc-1");
    expect(statusMsg.data.progress).toBe(50);

    broadcastLogMessage("info", "hello", { ctx: true });
    const logMsg = JSON.parse(ws.sent.at(-1));
    expect(logMsg.type).toBe("log");
    expect(logMsg.level).toBe("info");
    expect(logMsg.message).toBe("hello");
    expect(logMsg.data.ctx).toBe(true);
  });
});
