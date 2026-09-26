import { EventEmitter } from "events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const detectAvailableDiscsMock = vi.fn();
const loadDrivesWithWaitMock = vi.fn();
const ejectAllDrivesMock = vi.fn();
const prepareRipRuntimeMock = vi.fn();
const startRippingMock = vi.fn();
const requestCancelMock = vi.fn();
const ripServiceCtorMock = vi.fn();
const logger = {
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  addSink: vi.fn(() => () => {}),
};
const broadcastStatusUpdateMock = vi.fn();
const broadcastLogMessageMock = vi.fn();

vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    mountPollInterval: 1,
    validate: vi.fn().mockResolvedValue(),
  },
}));

vi.mock("../../src/app.js", () => ({
  prepareRipRuntime: (...args) => prepareRipRuntimeMock(...args),
}));

vi.mock("../../src/services/disc.service.js", () => ({
  DiscService: {
    detectAvailableDiscs: (...args) => detectAvailableDiscsMock(...args),
  },
}));

vi.mock("../../src/services/drive.service.js", () => ({
  DriveService: {
    loadDrivesWithWait: (...args) => loadDrivesWithWaitMock(...args),
    ejectAllDrives: (...args) => ejectAllDrivesMock(...args),
  },
}));

class MockRipService {
  constructor(options) {
    ripServiceCtorMock(options);
  }

  startRipping(...args) {
    return startRippingMock(...args);
  }

  requestCancel(...args) {
    return requestCancelMock(...args);
  }

  wasCancelled() {
    return false;
  }

  isCancellationRequested() {
    return false;
  }

  isCancellationError() {
    return false;
  }

  getHandBrakeStatus() {
    return { active: null, pending: 0, total: 0 };
  }

  async waitForHandBrakeQueue() {}
}

vi.mock("../../src/services/rip.service.js", () => ({
  RipService: MockRipService,
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: logger,
}));

vi.mock("../../src/web/middleware/websocket.middleware.js", () => ({
  broadcastStatusUpdate: (...args) => broadcastStatusUpdateMock(...args),
  broadcastLogMessage: (...args) => broadcastLogMessageMock(...args),
}));

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function getRouteHandler(router, method, routePath) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  }

  return layer.route.stack[0].handle;
}

describe("api routes rip mode", () => {
  let startRipHandler;
  let stopHandler;
  let statusHandler;
  let loadHandler;
  let ejectHandler;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();

    const { apiRoutes } = await import("../../src/web/routes/api.routes.js");

    startRipHandler = getRouteHandler(apiRoutes, "post", "/rip/start");
    stopHandler = getRouteHandler(apiRoutes, "post", "/stop");
    statusHandler = getRouteHandler(apiRoutes, "get", "/status");
    loadHandler = getRouteHandler(apiRoutes, "post", "/drives/load");
    ejectHandler = getRouteHandler(apiRoutes, "post", "/drives/eject");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays in rip mode after a rip cycle completes", async () => {
    prepareRipRuntimeMock.mockResolvedValue(undefined);
    startRippingMock.mockResolvedValue(undefined);
    detectAvailableDiscsMock
      .mockResolvedValueOnce([{ title: "Movie", driveNumber: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const startRes = createResponse();
    await startRipHandler({}, startRes);

    expect(startRes.statusCode).toBe(200);
    expect(startRes.payload).toEqual({
      success: true,
      message: "Rip mode enabled",
    });

    await vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();

    expect(prepareRipRuntimeMock).toHaveBeenCalledTimes(1);
    expect(ripServiceCtorMock).toHaveBeenCalledWith({
      exitOnCriticalError: false,
      backgroundHandBrake: true,
      encodeQueue: expect.any(Object),
    });

    await vi.waitFor(() => {
      expect(broadcastLogMessageMock).toHaveBeenCalledWith(
        "success",
        expect.stringContaining("Rip cycle completed successfully")
      );
    });

    const statusRes = createResponse();
    await statusHandler({}, statusRes);

    expect(statusRes.payload.status).toBe("ripping");
    expect(statusRes.payload.canStop).toBe(true);
    expect(statusRes.payload.operation).toMatch(
      /Waiting for disc insertion\.\.\.|was already ripped/
    );

    await stopHandler({}, createResponse());
  });

  it("rips a disc that was swapped in while the previous rip was running", async () => {
    // The drives are never observed empty: the user swapped discs while the
    // first rip (and its background encode) had detection paused.
    prepareRipRuntimeMock.mockResolvedValue(undefined);
    startRippingMock.mockResolvedValue(undefined);
    detectAvailableDiscsMock
      .mockResolvedValueOnce([{ title: "MovieA", driveNumber: 0 }])
      .mockResolvedValue([{ title: "MovieB", driveNumber: 0 }]);

    await startRipHandler({}, createResponse());

    await vi.waitFor(() => {
      expect(startRippingMock).toHaveBeenCalledTimes(2);
    });

    // One session serves both cycles, so its encode queue survives the swap.
    expect(ripServiceCtorMock).toHaveBeenCalledTimes(1);

    await stopHandler({}, createResponse());
  });

  it("waits instead of re-ripping a disc that is still loaded", async () => {
    prepareRipRuntimeMock.mockResolvedValue(undefined);
    startRippingMock.mockResolvedValue(undefined);
    detectAvailableDiscsMock.mockResolvedValue([
      { title: "MovieA", driveNumber: 0 },
    ]);

    await startRipHandler({}, createResponse());

    await vi.waitFor(() => {
      expect(startRippingMock).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(startRippingMock).toHaveBeenCalledTimes(1);

    const statusRes = createResponse();
    await statusHandler({}, statusRes);
    expect(statusRes.payload.operation).toContain("was already ripped");

    await stopHandler({}, createResponse());
  });

  it("does not treat a failed detection as an empty drive", async () => {
    prepareRipRuntimeMock.mockResolvedValue(undefined);
    startRippingMock.mockResolvedValue(undefined);
    detectAvailableDiscsMock
      .mockResolvedValueOnce([{ title: "MovieA", driveNumber: 0 }])
      .mockRejectedValueOnce(new Error("MakeMKV busy"))
      .mockResolvedValue([{ title: "MovieA", driveNumber: 0 }]);

    await startRipHandler({}, createResponse());

    await vi.waitFor(() => {
      expect(startRippingMock).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(5000);

    // A detection hiccup must not look like the disc was removed and reloaded.
    expect(startRippingMock).toHaveBeenCalledTimes(1);

    await stopHandler({}, createResponse());
  });

  it("can stop rip mode while waiting for a new disc", async () => {
    detectAvailableDiscsMock.mockResolvedValue([]);

    const startRes = createResponse();
    await startRipHandler({}, startRes);

    await vi.runAllTicks();
    await Promise.resolve();

    const waitingStatusRes = createResponse();
    await statusHandler({}, waitingStatusRes);

    expect(waitingStatusRes.payload.status).toBe("ripping");
    expect(waitingStatusRes.payload.canStop).toBe(true);
    expect(waitingStatusRes.payload.operation).toBe("Waiting for disc insertion...");

    const stopRes = createResponse();
    await stopHandler({}, stopRes);

    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.payload).toEqual({ success: true, message: "Operation stopped" });

    const stoppedStatusRes = createResponse();
    await statusHandler({}, stoppedStatusRes);

    expect(stoppedStatusRes.payload.status).toBe("idle");
    expect(stoppedStatusRes.payload.canStop).toBe(false);
    expect(stoppedStatusRes.payload.operation).toBeNull();
  });

  it("requests mid-stream cancellation when stopping an active rip", async () => {
    prepareRipRuntimeMock.mockResolvedValue(undefined);
    detectAvailableDiscsMock.mockResolvedValue([{ title: "Movie", driveNumber: 0 }]);

    let resolveRip;
    startRippingMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRip = resolve;
        })
    );

    const startRes = createResponse();
    await startRipHandler({}, startRes);

    await vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();

    const stopRes = createResponse();
    await stopHandler({}, stopRes);

    expect(stopRes.statusCode).toBe(200);
    expect(requestCancelMock).toHaveBeenCalledTimes(1);

    const stoppingStatusRes = createResponse();
    await statusHandler({}, stoppingStatusRes);

    expect(stoppingStatusRes.payload.operation).toBe(
      "Cancelling current operation..."
    );
    expect(stoppingStatusRes.payload.canStop).toBe(true);

    resolveRip();
    await Promise.resolve();
    await Promise.resolve();

    await vi.waitFor(async () => {
      const finalStatusRes = createResponse();
      await statusHandler({}, finalStatusRes);

      expect(finalStatusRes.payload.status).toBe("idle");
      expect(finalStatusRes.payload.canStop).toBe(false);
    });
  });

  it("uses DriveService directly for load operations", async () => {
    loadDrivesWithWaitMock.mockResolvedValue(undefined);

    const res = createResponse();
    await loadHandler({}, res);

    expect(loadDrivesWithWaitMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      success: true,
      message: "Drives loaded successfully",
    });
  });

  it("uses DriveService directly for eject operations", async () => {
    ejectAllDrivesMock.mockResolvedValue(undefined);

    const res = createResponse();
    await ejectHandler({}, res);

    expect(ejectAllDrivesMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      success: true,
      message: "Drives ejected successfully",
    });
  });
});