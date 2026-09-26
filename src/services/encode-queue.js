import path from "path";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { HandBrakeService } from "./handbrake.service.js";

/**
 * A serial HandBrake encode queue.
 *
 * Encoding is deliberately one-at-a-time and decoupled from ripping: the disc
 * is ejected as soon as it is ripped, and the encode of the previous disc keeps
 * running while the next one is ripped. Only the ripping side knows when a run
 * is cancelled, so cancellation is injected rather than owned here.
 */
export class EncodeQueue {
  /**
   * @param {Object} options
   * @param {Object} options.cancellation - Cancellation seam from the ripper
   * @param {() => boolean} options.cancellation.isCancelled
   * @param {(message?: string) => Error} options.cancellation.createError
   * @param {(error: Error) => boolean} options.cancellation.isCancellationError
   * @param {() => AbortSignal} options.cancellation.getSignal
   */
  constructor({ cancellation }) {
    this.cancellation = cancellation;
    this.pending = [];
    this.active = null;
    this.workerPromise = null;
    this.workerError = null;
    this.succeeded = [];
    this.failed = [];
  }

  /**
   * A queue that no rip can cancel. The web server keeps one for its whole
   * lifetime, so stopping rip mode, saving the config or loading the next disc
   * never throws away encodes that are already queued.
   * @returns {EncodeQueue}
   */
  static detached() {
    return new EncodeQueue({
      cancellation: {
        isCancelled: () => false,
        createError: (message = "HandBrake processing cancelled") => {
          const error = new Error(message);
          error.name = "OperationCancelledError";
          error.isCancelled = true;
          return error;
        },
        isCancellationError: (error) => error?.isCancelled === true,
        getSignal: () => undefined,
      },
    });
  }

  /** @returns {boolean} */
  get cancelRequested() {
    return this.cancellation.isCancelled();
  }

  /**
   * Queue freshly written MKV files and make sure a worker is running.
   * @param {string[]} files - MKV file names
   * @param {string} outputFolder - Folder the files are in
   * @param {string} [label] - What to call them in the log
   */
  add(files, outputFolder, label = "MKV file") {
    if (!AppConfig.isHandBrakeEnabled || this.cancelRequested) {
      return;
    }

    for (const file of files) {
      const fullPath = path.join(outputFolder, file);
      // A folder can be offered twice (the startup scan, then the rip that
      // finishes it); encoding the same file twice would race on its output.
      if (this.#isQueued(fullPath)) {
        continue;
      }

      this.pending.push({ file, fullPath });
      Logger.info(`Queued ${label} for HandBrake processing: ${file}`);
    }

    this.start();
  }

  /**
   * Start the background worker if there is work and none is running.
   */
  start() {
    if (
      this.cancelRequested ||
      !AppConfig.isHandBrakeEnabled ||
      this.workerPromise ||
      this.pending.length === 0
    ) {
      return;
    }

    Logger.info(
      `Starting HandBrake pipeline worker for ${this.pending.length} queued file(s)...`
    );

    this.workerPromise = this.#run()
      .catch((error) => {
        this.workerError = error;
      })
      .finally(() => {
        this.workerPromise = null;

        // Work queued while this worker was finishing needs a new one.
        if (!this.cancelRequested && this.pending.length > 0) {
          this.start();
        }
      });
  }

  /**
   * Encode queued files one at a time.
   * @returns {Promise<void>}
   */
  async #run() {
    while (this.pending.length > 0) {
      this.#throwIfCancelled();
      const job = this.pending.shift();
      this.active = job;

      try {
        Logger.info(`Processing queued MKV file with HandBrake: ${job.file}`);
        const success = await HandBrakeService.convertFile(job.fullPath, {
          signal: this.cancellation.getSignal(),
        });

        this.#throwIfCancelled();

        if (success) {
          this.succeeded.push(job.file);
          Logger.info(`HandBrake processing succeeded for: ${job.file}`);
        } else {
          this.failed.push(job.file);
          Logger.error(`HandBrake processing failed for: ${job.file}`);
        }
      } catch (error) {
        if (this.cancellation.isCancellationError(error)) {
          throw error;
        }

        this.failed.push(job.file);
        Logger.error("HandBrake post-processing error:", error.message);
        if (error.details) {
          Logger.error("Error details:", error.details);
        }
      } finally {
        this.active = null;
      }
    }
  }

  /**
   * Run the queue to completion, reporting when there is nothing to do.
   * @returns {Promise<void>}
   */
  async drain() {
    if (!AppConfig.isHandBrakeEnabled) {
      return;
    }

    this.#throwIfCancelled();

    if (!this.workerPromise && this.pending.length === 0) {
      Logger.info("No HandBrake jobs queued for processing.");
      return;
    }

    this.start();
    await this.wait();
  }

  /**
   * Wait for background work to drain, without starting a worker or reporting
   * an empty queue. A worker error is rethrown once, then cleared.
   * @returns {Promise<void>}
   */
  async wait() {
    while (this.workerPromise) {
      await this.workerPromise;
    }

    if (this.workerError) {
      const error = this.workerError;
      this.workerError = null;
      throw error;
    }
  }

  /**
   * Snapshot of the pipeline, for status reporting while ripping continues.
   * @returns {{active: string|null, pending: number, total: number}}
   */
  status() {
    const active = this.active?.file ?? null;
    return {
      active,
      pending: this.pending.length,
      total: this.pending.length + (active ? 1 : 0),
    };
  }

  /** Drop everything still waiting. The in-flight encode is aborted by signal. */
  clear() {
    this.pending = [];
  }

  /**
   * Log the encode results and reset them for the next run.
   */
  reportResults() {
    if (!AppConfig.isHandBrakeEnabled) {
      this.succeeded = [];
      this.failed = [];
      return;
    }

    if (this.succeeded.length > 0) {
      Logger.info(
        "The following files were successfully converted with HandBrake: ",
        this.succeeded.join(", ")
      );
    }

    if (this.failed.length > 0) {
      Logger.info(
        "The following files failed HandBrake conversion: ",
        this.failed.join(", ")
      );
    }

    this.succeeded = [];
    this.failed = [];
  }

  /**
   * @param {string} fullPath
   * @returns {boolean} Whether the file is already waiting or being encoded
   */
  #isQueued(fullPath) {
    const normalize = (file) => {
      const resolved = path.resolve(file);
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    const key = normalize(fullPath);
    const matches = (job) => normalize(job.fullPath) === key;
    return (
      (this.active !== null && matches(this.active)) ||
      this.pending.some(matches)
    );
  }

  /**
   * @param {string} [message]
   * @throws when the run has been cancelled
   */
  #throwIfCancelled(message = "HandBrake processing cancelled") {
    if (this.cancelRequested) {
      throw this.cancellation.createError(message);
    }
  }
}
