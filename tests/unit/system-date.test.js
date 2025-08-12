import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock logger to keep output clean and to assert calls when needed
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SystemDateManager - basic utilities", () => {
  let SystemDateManager;
  let Logger;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    ({ SystemDateManager } = await import("../../src/utils/system-date.js"));
    ({ Logger } = await import("../../src/utils/logger.js"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats local date/time as YYYY-MM-DD HH:mm:ss", () => {
    const manager = new SystemDateManager();
    const d = new Date(2020, 0, 2, 3, 4, 5); // local time components
    expect(manager.formatLocalDateTime(d)).toBe("2020-01-02 03:04:05");
  });

  it("builds Windows set/restore commands", () => {
    const manager = new SystemDateManager();
    const d = new Date(2024, 5, 7, 11, 22, 33);
    const cmd = manager.getWindowsCommands(d);
    expect(cmd.requiresAdmin).toBe(true);
    expect(cmd.setDate).toMatch(/date .* && time .*/);
    expect(cmd.restoreDate).toMatch(/w32tm/);
  });

  it("dispatches to platform-specific command builders", () => {
    const manager = new SystemDateManager();
    const d = new Date();
    const original = process.platform;
    const spyWin = vi.spyOn(manager, "getWindowsCommands").mockReturnValue({});
    const spyMac = vi.spyOn(manager, "getMacOSCommands").mockReturnValue({});
    const spyLin = vi.spyOn(manager, "getLinuxCommands").mockReturnValue({});

    Object.defineProperty(process, "platform", { value: "win32" });
    manager.getPlatformCommands(d);
    expect(spyWin).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, "platform", { value: "darwin" });
    manager.getPlatformCommands(d);
    expect(spyMac).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, "platform", { value: "linux" });
    manager.getPlatformCommands(d);
    expect(spyLin).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, "platform", { value: original });
  });

  it("builds Linux commands with sudo when not root and uses timedatectl first", () => {
    const manager = new SystemDateManager();
    vi.spyOn(manager, "isRunningAsRoot").mockReturnValue(false);
    const cmd = manager.getLinuxCommands(new Date(2024, 0, 1, 0, 0, 0));
    expect(cmd.setDate).toMatch(/sudo timedatectl .*set-ntp false/);
    expect(cmd.setDate).toMatch(/sudo timedatectl .*set-time/);
    expect(cmd.restoreDate).toMatch(/sudo timedatectl .*set-ntp true/);
    expect(cmd.requiresAdmin).toBe(true);
  });

  it("builds macOS commands and prefixes with sudo in definitions", () => {
    const manager = new SystemDateManager();
    const cmd = manager.getMacOSCommands(new Date(2023, 9, 5, 12, 34));
    expect(cmd.setDate).toMatch(/^sudo date -u \d{12}$/);
    expect(cmd.restoreDate).toMatch(/^sudo sntp -sS time.apple.com$/);
    expect(cmd.requiresAdmin).toBe(true);
  });

  it("returns manual restore command when originalDate exists (Windows)", () => {
    const manager = new SystemDateManager();
    manager.originalDate = new Date(2021, 11, 31, 23, 59, 58);
    const manual = manager.getManualRestoreCommand();
    expect(manual).toMatch(/date .* && time .*/);
  });
});

describe("SystemDateManager - async flows", () => {
  let SystemDateManager;
  let Logger;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    // Mock exec to be controllable per-test
    vi.doMock("child_process", () => ({
      exec: vi.fn((cmd, cb) => cb(null, "", "")),
    }));

    ({ SystemDateManager } = await import("../../src/utils/system-date.js"));
    ({ Logger } = await import("../../src/utils/logger.js"));
  });

  afterEach(() => {
    delete process.env.DOCKER_CONTAINER;
  });

  it("setSystemDate: no-op with warning inside Docker", async () => {
    process.env.DOCKER_CONTAINER = "true";
    const manager = new SystemDateManager();
    await manager.setSystemDate(new Date());
    expect(Logger.warning).toHaveBeenCalled();
    expect(manager.isSystemDateChanged()).toBe(false);
  });

  it("setSystemDate: guard when already changed", async () => {
    const manager = new SystemDateManager();
    manager.isDateChanged = true;
    await manager.setSystemDate(new Date());
    expect(Logger.warning).toHaveBeenCalledWith(
      expect.stringMatching(/already changed/i)
    );
  });

  it("setSystemDate: success path marks state and logs", async () => {
    const manager = new SystemDateManager();
    // Speed up verification by using current time
    const target = new Date();
    await manager.setSystemDate(target);
    expect(manager.isSystemDateChanged()).toBe(true);
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/successfully changed/i)
    );
  });

  it("setSystemDate: verification failure throws and logs error", async () => {
    const manager = new SystemDateManager();
    // Force verification to fail by using far-future past date
    const badTarget = new Date(2000, 0, 1, 0, 0, 0);
    await expect(manager.setSystemDate(badTarget)).rejects.toThrow(
      /Unable to change system date/
    );
    expect(Logger.error).toHaveBeenCalled();
  });

  it("restoreSystemDate: no-op if not changed", async () => {
    const manager = new SystemDateManager();
    await manager.restoreSystemDate();
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/not changed/i)
    );
  });

  it("restoreSystemDate: bypass in Docker", async () => {
    process.env.DOCKER_CONTAINER = "true";
    const manager = new SystemDateManager();
    manager.isDateChanged = true;
    await manager.restoreSystemDate();
    // Should not throw and not toggle state inside Docker path
    expect(manager.isSystemDateChanged()).toBe(true);
  });

  it("restoreWindowsDate: tries methods in order and succeeds", async () => {
    const { exec } = await import("child_process");
    const manager = new SystemDateManager();
    manager.originalDate = new Date();
    // First call errors, second succeeds
    exec
      .mockImplementationOnce((cmd, cb) => cb(new Error("fail")))
      .mockImplementationOnce((cmd, cb) => cb(null, "", "completed"));
    await expect(manager.restoreWindowsDate()).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("withTemporaryDate: sets, runs, restores", async () => {
    const manager = new SystemDateManager();
    const spySet = vi.spyOn(manager, "setSystemDate").mockResolvedValue();
    const spyRestore = vi
      .spyOn(manager, "restoreSystemDate")
      .mockResolvedValue();
    const result = await manager.withTemporaryDate(new Date(), async () => 42);
    expect(result).toBe(42);
    expect(spySet).toHaveBeenCalledTimes(1);
    expect(spyRestore).toHaveBeenCalledTimes(1);
  });
});
