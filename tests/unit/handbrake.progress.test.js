/**
 * Encode-phase progress reporting and CPU priority. An encode now overlaps the
 * next disc's rip, so it must report periodically and stay out of MakeMKV's way.
 */

import { EventEmitter } from "events";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const setPriorityMock = vi.fn();

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual, setPriority: (...args) => setPriorityMock(...args) },
    setPriority: (...args) => setPriorityMock(...args),
  };
});

vi.mock("../../src/utils/logger.js", () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/config/index.js", () => ({
  AppConfig: { handbrake: { enabled: true, cpu_percent: 75 } },
}));

const os = (await import("os")).default;
const { HandBrakeService } = await import(
  "../../src/services/handbrake.service.js"
);
const { Logger } = await import("../../src/utils/logger.js");

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe("HandBrake encode progress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the latest percentage every minute", () => {
    const child = fakeChild();
    const stop = HandBrakeService.reportProgress(child, "movie.mkv");

    child.stderr.emit(
      "data",
      Buffer.from("Encoding: task 1 of 1, 12.30 %\nEncoding: task 1 of 1, 42.10 %\n")
    );

    expect(Logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Encoding movie.mkv: 42.1%")
    );

    stop();
  });

  it("still reports elapsed time before HandBrake prints a percentage", () => {
    const child = fakeChild();
    const stop = HandBrakeService.reportProgress(child, "movie.mkv");

    vi.advanceTimersByTime(120_000);

    expect(Logger.info).toHaveBeenLastCalledWith("Encoding movie.mkv: 2m 00s elapsed");
    stop();
  });

  it("stops reporting when the encode ends", () => {
    const child = fakeChild();
    HandBrakeService.reportProgress(child, "movie.mkv");

    child.emit("close", 0);
    vi.advanceTimersByTime(300_000);

    expect(Logger.info).not.toHaveBeenCalled();
  });

  it("tolerates a missing child process", () => {
    expect(() => HandBrakeService.reportProgress(undefined, "movie.mkv")()).not.toThrow();
  });

  it("drops the encode to below-normal priority", () => {
    HandBrakeService.deprioritize({ pid: 4242 });

    expect(setPriorityMock).toHaveBeenCalledWith(
      4242,
      os.constants.priority.PRIORITY_BELOW_NORMAL
    );
  });

  it("carries on when the priority cannot be changed", () => {
    setPriorityMock.mockImplementationOnce(() => {
      throw new Error("EPERM");
    });

    expect(() => HandBrakeService.deprioritize({ pid: 1 })).not.toThrow();
    expect(Logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("Could not lower HandBrake priority")
    );
  });

  it("ignores a child that never started", () => {
    HandBrakeService.deprioritize(undefined);
    HandBrakeService.deprioritize({});

    expect(setPriorityMock).not.toHaveBeenCalled();
  });
});
