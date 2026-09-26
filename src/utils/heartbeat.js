import { Logger } from "./logger.js";

/** Default gap between heartbeat lines. */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Logs a one-line summary of a long-running operation on a fixed interval.
 *
 * The point of driving this from a timer rather than from the operation's own
 * output is that the output is the first thing to stop: a drive grinding on a
 * bad sector produces no progress lines for minutes at a time, which is exactly
 * when a status update is worth the most. Callers keep the latest state and
 * hand back a description whenever the timer asks for one.
 */
export class ProgressHeartbeat {
  /**
   * @param {Object} options
   * @param {() => string|null} options.describe - Called on each beat; return
   *   null to skip that beat.
   * @param {number} [options.intervalMs=60000]
   * @param {(message: string) => void} [options.log]
   */
  constructor({ describe, intervalMs = HEARTBEAT_INTERVAL_MS, log } = {}) {
    this.describe = describe;
    this.intervalMs = intervalMs;
    this.log = log ?? ((message) => Logger.info(message));
    this.timer = null;
  }

  /**
   * Begin beating. The first line comes one interval from now, so it never
   * duplicates whatever the caller logged when it started the operation.
   * @returns {() => void} stop function, safe to call more than once
   */
  start() {
    if (this.timer) {
      return () => this.stop();
    }

    this.timer = setInterval(() => this.beat(), this.intervalMs);
    // Never hold the process open just to report on work that has ended.
    this.timer.unref?.();

    return () => this.stop();
  }

  /** Emit one line now, if the describer has something to say. */
  beat() {
    let message = null;
    try {
      message = this.describe?.();
    } catch {
      // A broken describer must not kill the operation it is reporting on.
      return;
    }

    if (message) {
      this.log(message);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
