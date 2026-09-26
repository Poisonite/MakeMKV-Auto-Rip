/**
 * The heartbeat is what guarantees a status line every minute even when the
 * operation being reported on has gone silent, so its timing is the contract.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
  Logger: { info: vi.fn() },
}));

const { ProgressHeartbeat, HEARTBEAT_INTERVAL_MS } = await import(
  "../../src/utils/heartbeat.js"
);
const { Logger } = await import("../../src/utils/logger.js");

describe("ProgressHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to one line a minute", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(60_000);
  });

  it("logs on every interval without needing to be fed", () => {
    const log = vi.fn();
    let tick = 0;
    const stop = new ProgressHeartbeat({
      describe: () => `tick ${++tick}`,
      intervalMs: 60_000,
      log,
    }).start();

    // Nothing at start: the caller has just logged what it is doing.
    expect(log).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(log).toHaveBeenCalledWith("tick 1");

    vi.advanceTimersByTime(180_000);
    expect(log).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenLastCalledWith("tick 4");

    stop();
    vi.advanceTimersByTime(300_000);
    expect(log).toHaveBeenCalledTimes(4);
  });

  it("skips a beat when the describer has nothing to say", () => {
    const log = vi.fn();
    new ProgressHeartbeat({
      describe: () => null,
      intervalMs: 1000,
      log,
    }).start();

    vi.advanceTimersByTime(5000);
    expect(log).not.toHaveBeenCalled();
  });

  it("keeps beating when a describer throws", () => {
    const log = vi.fn();
    let calls = 0;
    new ProgressHeartbeat({
      describe: () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("bad describer");
        }
        return "recovered";
      },
      intervalMs: 1000,
      log,
    }).start();

    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(log).toHaveBeenCalledExactlyOnceWith("recovered");
  });

  it("logs through the Logger by default", () => {
    new ProgressHeartbeat({ describe: () => "status", intervalMs: 1000 }).start();

    vi.advanceTimersByTime(1000);

    expect(Logger.info).toHaveBeenCalledWith("status");
  });

  it("is safe to stop more than once and to start twice", () => {
    const log = vi.fn();
    const heartbeat = new ProgressHeartbeat({
      describe: () => "x",
      intervalMs: 1000,
      log,
    });

    const stop = heartbeat.start();
    heartbeat.start(); // must not create a second timer

    vi.advanceTimersByTime(1000);
    expect(log).toHaveBeenCalledTimes(1);

    stop();
    stop();
    vi.advanceTimersByTime(5000);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
