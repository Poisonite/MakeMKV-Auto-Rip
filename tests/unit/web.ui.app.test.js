// @vitest-environment jsdom
import { beforeEach, afterEach, vi, it, expect } from "vitest";

// Minimal DOM skeleton required by app.js
function setupDOM() {
  document.body.innerHTML = `
    <div>
      <div id="statusIndicator"></div>
      <span id="statusText"></span>
      <span id="currentStatus"></span>
      <span id="currentOperation"></span>
      <button id="loadDrivesBtn"></button>
      <button id="ejectDrivesBtn"></button>
      <button id="startRippingBtn"></button>
      <div class="logs-container"><div id="logsContent"></div></div>
      <button id="clearLogsBtn"></button>
    </div>
  `;
}

const wsInstances = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose && this.onclose();
    });
    wsInstances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen && this.onopen();
  }

  receive(data) {
    this.onmessage && this.onmessage({ data: JSON.stringify(data) });
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  wsInstances.length = 0;
  setupDOM();

  // Mock global WebSocket and fetch
  // Different endpoints return specific payloads
  // Default: success true
  globalThis.WebSocket = MockWebSocket;
  globalThis.fetch = vi.fn(async (url) => {
    if (url === "/api/status") {
      return {
        json: async () => ({ status: "idle", operation: null, canStop: false }),
      };
    }
    if (url === "/api/drives/load") {
      return { json: async () => ({ success: true, message: "Loaded." }) };
    }
    if (url === "/api/drives/eject") {
      return { json: async () => ({ success: true, message: "Ejected." }) };
    }
    if (url === "/api/rip/start") {
      return {
        json: async () => ({ success: true, message: "Ripping started." }),
      };
    }
    if (url === "/api/stop") {
      return { json: async () => ({ success: true, message: "Stopped." }) };
    }
    return { json: async () => ({ success: true }) };
  });

  // Fresh import each test to re-run script side effects and listeners
  vi.resetModules();
  await import("../../src/web/static/js/app.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("connects via WebSocket, subscribes, and polls status once", async () => {
  // Trigger the script's DOMContentLoaded initializer
  document.dispatchEvent(new Event("DOMContentLoaded"));

  // At least one WebSocket should be created to current host
  expect(wsInstances.length).toBeGreaterThanOrEqual(1);
  const last = wsInstances[wsInstances.length - 1];
  expect(last.url).toBe(`ws://${window.location.host}`);

  // Simulate server opening the socket
  last.open();

  // Allow async fetchStatus() to resolve
  await vi.runAllTicks();
  await Promise.resolve();
  await Promise.resolve();

  // Subscribed via WebSocket
  expect(last.send).toHaveBeenCalledWith(
    expect.stringContaining('"type":"subscribe"')
  );

  // Initial status fetched and applied
  expect(globalThis.fetch).toHaveBeenCalledWith("/api/status");
  expect(document.getElementById("statusText").textContent).toBe("Connected");
  expect(document.getElementById("currentStatus").textContent).toBe("Idle");
});

it("handles incoming WebSocket messages and updates status/logs", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  // server emits a connected message
  last.receive({ type: "connected", message: "hello" });
  // emits status update running operation
  last.receive({
    type: "status_update",
    status: "ripping",
    operation: "Disc 1",
    canStop: true,
  });

  await vi.runAllTicks();

  expect(document.getElementById("currentStatus").textContent).toBe("Ripping");
  expect(document.getElementById("currentOperation").textContent).toBe(
    "Disc 1"
  );

  // a log entry for the connected message should exist
  const logs = Array.from(document.querySelectorAll("#logsContent .log-entry"));
  expect(logs.some((n) => n.textContent.includes("hello"))).toBe(true);
});

it("buttons trigger API calls and stop behavior when canStop is true", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  // Put UI in ripping state where stop is allowed
  last.receive({
    type: "status_update",
    status: "ripping",
    operation: "Disc 9",
    canStop: true,
  });
  await vi.runAllTicks();

  // Clicking startRipping should call /api/stop instead of /api/rip/start
  document.getElementById("startRippingBtn").click();
  await vi.runAllTicks();

  const calls = globalThis.fetch.mock.calls.map((c) => c[0]);
  expect(calls.includes("/api/stop")).toBe(true);

  // Switch to idle and test normal operations
  last.receive({
    type: "status_update",
    status: "idle",
    operation: null,
    canStop: false,
  });
  await vi.runAllTicks();

  document.getElementById("loadDrivesBtn").click();
  document.getElementById("ejectDrivesBtn").click();
  document.getElementById("startRippingBtn").click();
  await vi.runAllTicks();

  expect(globalThis.fetch).toHaveBeenCalledWith(
    "/api/drives/load",
    expect.any(Object)
  );
  expect(globalThis.fetch).toHaveBeenCalledWith(
    "/api/drives/eject",
    expect.any(Object)
  );
  expect(globalThis.fetch).toHaveBeenCalledWith(
    "/api/rip/start",
    expect.any(Object)
  );
});

it("clearLogs empties log area and adds a confirmation entry", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  // Add two logs
  last.receive({ type: "log", level: "info", message: "a" });
  last.receive({ type: "log", level: "warn", message: "b" });
  await vi.runAllTicks();

  const logsContent = document.getElementById("logsContent");
  expect(logsContent.children.length).toBeGreaterThanOrEqual(2);

  // Clear
  document.getElementById("clearLogsBtn").click();
  await vi.runAllTicks();

  // After clear, there should be one new "Logs cleared" entry
  expect(logsContent.children.length).toBe(1);
  expect(logsContent.textContent).toMatch(/Logs cleared/);
});

it("reconnects after socket close and logs attempt", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  let last = wsInstances[wsInstances.length - 1];
  last.open();

  // Close connection -> should start reconnect interval (5s)
  last.close();
  await vi.runAllTicks();

  // Advance time to trigger reconnect attempt
  vi.advanceTimersByTime(5000);
  await vi.runAllTicks();

  // A new WebSocket should be created
  expect(wsInstances.length).toBeGreaterThanOrEqual(2);
  const newWs = wsInstances[wsInstances.length - 1];
  newWs.open();
  await vi.runAllTicks();

  // Log should include reconnect attempt
  const logsText = document.getElementById("logsContent").textContent;
  expect(logsText).toMatch(/Attempting to reconnect/);
});

it("trims logs to last 100 entries", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  for (let i = 0; i < 105; i += 1) {
    last.receive({ type: "log", level: "info", message: String(i) });
  }
  await vi.runAllTicks();

  expect(document.getElementById("logsContent").children.length).toBe(100);
});

it("logs error when start ripping fails", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  // Next fetch call (to /api/rip/start) rejects
  globalThis.fetch.mockRejectedValueOnce(new Error("boom"));

  document.getElementById("startRippingBtn").click();
  await vi.runAllTicks();

  expect(document.getElementById("logsContent").textContent).toMatch(
    /Failed to start ripping: boom/
  );
});

it("updates button labels for loading and ejecting states when stoppable", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  const loadBtn = document.getElementById("loadDrivesBtn");
  const ejectBtn = document.getElementById("ejectDrivesBtn");
  const ripBtn = document.getElementById("startRippingBtn");

  last.receive({
    type: "status_update",
    status: "loading",
    operation: null,
    canStop: true,
  });
  await vi.runAllTicks();
  expect(loadBtn.innerHTML).toMatch(/Stop Loading/);
  expect(loadBtn.disabled).toBe(false);
  expect(ejectBtn.disabled).toBe(true);
  expect(ripBtn.disabled).toBe(true);

  last.receive({
    type: "status_update",
    status: "ejecting",
    operation: null,
    canStop: true,
  });
  expect(ejectBtn.innerHTML).toMatch(/Stop Ejecting/);
  expect(ejectBtn.disabled).toBe(false);
  expect(loadBtn.disabled).toBe(true);
  expect(ripBtn.disabled).toBe(true);
});

it("logs connection error on websocket error event", async () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const last = wsInstances[wsInstances.length - 1];
  last.open();

  last.onerror && last.onerror(new Error("ws oops"));
  await vi.runAllTicks();

  expect(document.getElementById("logsContent").textContent).toMatch(
    /Connection error occurred/
  );
});
