import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { ValidationUtils } from "../utils/validation.js";
import { DiscService } from "./disc.service.js";
import { DriveService } from "./drive.service.js";
import { STALL_NOTICE_SEC } from "./recovery.service.js";
import { ReadErrorRecovery } from "./read-error-recovery.js";
import { EncodeQueue } from "./encode-queue.js";
import { formatDuration } from "../utils/format.js";
import { ProgressHeartbeat } from "../utils/heartbeat.js";
import { safeExit, withSystemDate, killProcessTree } from "../utils/process.js";
import { MakeMKVMessages } from "../utils/makemkv-messages.js";

/**
 * Service for handling DVD/Blu-ray ripping operations
 */
export class RipService {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.exitOnCriticalError=true] - Exit the process on a
   *   critical failure (CLI behaviour) instead of rethrowing to the caller.
   * @param {boolean} [options.backgroundHandBrake=false] - Let HandBrake keep
   *   encoding after `startRipping()` resolves instead of blocking on the queue.
   *   Used by rip mode so the next disc can be ripped while the previous one is
   *   still encoding.
   * @param {import("./encode-queue.js").EncodeQueue} [options.encodeQueue] - A
   *   queue that outlives this service (the web server's). Cancelling a rip then
   *   leaves its encodes alone; without one the service owns a private queue
   *   that is cancelled with the rip.
   */
  constructor(options = {}) {
    this.goodVideoArray = [];
    this.badVideoArray = [];
    this.exitOnCriticalError = options.exitOnCriticalError !== false;
    this.backgroundHandBrake = options.backgroundHandBrake === true;
    this.cancelRequested = false;
    this.runCancelled = false;
    this.activeRipProcesses = new Set();
    this.abortController = new AbortController();

    // Encoding and damaged-disc salvage are their own workflows. Both need this
    // service's cancellation and nothing else from it.
    const cancellation = this.#cancellationSeam();
    this.ownsEncodeQueue = !options.encodeQueue;
    this.encodeQueue = options.encodeQueue ?? new EncodeQueue({ cancellation });
    this.readErrorRecovery = new ReadErrorRecovery({
      cancellation,
      onRecoveredFiles: (files, outputFolder) =>
        this.encodeQueue.add(files, outputFolder, "recovered MKV file"),
    });
  }

  /**
   * The parts of this run's cancellation that collaborators need. The signal is
   * read lazily because a new run installs a fresh AbortController.
   * @returns {Object}
   */
  #cancellationSeam() {
    return {
      isCancelled: () => this.cancelRequested,
      createError: (message) => this.createCancellationError(message),
      isCancellationError: (error) => this.isCancellationError(error),
      registerProcess: (child) => this.registerRipProcess(child),
      getSignal: () => this.abortController.signal,
    };
  }

  prepareForRun() {
    this.cancelRequested = false;
    this.runCancelled = false;

    // The encode queue is deliberately left alone: it outlives the rip cycle
    // that filled it (see `backgroundHandBrake`). Likewise activeRipProcesses,
    // whose entries remove themselves when their process closes.
    if (this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
  }

  createCancellationError(message = "Operation cancelled") {
    const error = new Error(message);
    error.name = "OperationCancelledError";
    error.isCancelled = true;
    return error;
  }

  isCancellationError(error) {
    return Boolean(
      error?.isCancelled === true ||
      (this.cancelRequested &&
        (error?.name === "AbortError" ||
          error?.code === "ABORT_ERR" ||
          error?.signal === "SIGTERM" ||
          error?.killed === true))
    );
  }

  throwIfCancelled(message = "Operation cancelled") {
    if (this.cancelRequested) {
      throw this.createCancellationError(message);
    }
  }

  isCancellationRequested() {
    return this.cancelRequested;
  }

  wasCancelled() {
    return this.runCancelled;
  }

  requestCancel() {
    if (this.cancelRequested) {
      return false;
    }

    this.cancelRequested = true;
    this.runCancelled = true;
    if (this.ownsEncodeQueue) {
      this.encodeQueue.clear();
    }

    if (!this.abortController.signal.aborted) {
      this.abortController.abort(this.createCancellationError());
    }

    for (const childProcess of this.activeRipProcesses) {
      // Tree-kill: a recovery child is `bash -lc` wrapping ddrescue, and on
      // Windows a plain kill would orphan ddrescue (leaving it holding the drive).
      killProcessTree(childProcess);
    }

    return true;
  }

  registerRipProcess(childProcess) {
    if (!childProcess || typeof childProcess.kill !== "function") {
      return () => {};
    }

    this.activeRipProcesses.add(childProcess);

    const cleanup = () => {
      this.activeRipProcesses.delete(childProcess);
    };

    childProcess.once?.("close", cleanup);
    childProcess.once?.("error", cleanup);

    return cleanup;
  }

  extractOutputFolder(stdout) {
    const candidateLines = stdout.split(/\r?\n/).filter(line =>
      line.includes('MSG:5014') || line.includes('Saving')
    );

    for (const line of candidateLines) {
      const quotedValues = Array.from(line.matchAll(/"([^"]*)"/g), match => match[1]);
      const directPath = [...quotedValues].reverse().find(value => value.startsWith('file://'));
      if (directPath) {
        return this.normalizeOutputFolder(directPath);
      }

      const messageWithPath = quotedValues.find(value => value.includes('Saving') && value.includes('directory '));
      if (messageWithPath) {
        const messageMatch = messageWithPath.match(/Saving \d+ titles into directory (.+)$/);
        if (messageMatch) {
          return this.normalizeOutputFolder(messageMatch[1]);
        }
      }

      const looseMatch = line.match(/Saving \d+ titles into directory (.+)$/);
      if (looseMatch) {
        return this.normalizeOutputFolder(looseMatch[1].replace(/"+$/g, '').trim());
      }
    }

    return null;
  }

  normalizeOutputFolder(outputFolder) {
    return outputFolder
      .replace(/^file:\/\//, '')
      .replace(/[\\/]/g, path.sep);
  }

  /**
   * Work out where MakeMKV actually wrote the titles.
   * `ripDir` (the folder we created and handed to MakeMKV) is authoritative and
   * absolute; the path parsed out of the log is only used as a fallback, and is
   * resolved because MakeMKV echoes it back relative when it was given one.
   * @param {string} stdout - MakeMKV output
   * @param {string} [ripDir] - Folder passed to MakeMKV for this rip
   * @returns {string|null}
   */
  resolveOutputFolder(stdout, ripDir) {
    if (ripDir) {
      return ripDir;
    }

    const parsed = this.extractOutputFolder(stdout);
    return parsed ? path.resolve(parsed) : null;
  }

  /**
   * Start the ripping process for all available discs
   * @returns {Promise<void>}
   */
  async startRipping() {
    this.prepareForRun();

    try {
      // Load drives first if loading is enabled
      if (AppConfig.isLoadDrivesEnabled) {
        Logger.info("Loading drives before ripping...");
        await DriveService.loadDrivesWithWait();
      }

      // Get fake date from config and execute entire ripping operation with temporary system date
      const fakeDate = AppConfig.makeMKVFakeDate;

      await withSystemDate(fakeDate, async () => {
        this.throwIfCancelled("Ripping cancelled");
        Logger.info("Beginning AutoRip... Please Wait.");
        const commandDataItems = await DiscService.getAvailableDiscs();

        // Check if any discs were found
        if (commandDataItems.length === 0) {
          Logger.info(
            "No discs found to rip. No ripping operations will be performed."
          );
          Logger.separator();
          await this.handlePostRipActions();
          return;
        }

        Logger.info(
          `Found ${commandDataItems.length} disc(s) ready for ripping.`
        );
        await this.processRippingQueue(commandDataItems);
        this.throwIfCancelled("Ripping cancelled");
        await this.handlePostRipActions();
        this.throwIfCancelled("Ripping cancelled");

        if (this.backgroundHandBrake) {
          // Hand the encode queue off to the background worker and return: the
          // discs are already ejected, so the drive is free for the next one
          // while HandBrake keeps working.
          this.encodeQueue.start();
          this.displayResults({ includeHandBrake: false });
          return;
        }

        await this.processHandBrakeQueue();
        this.throwIfCancelled("Ripping cancelled");
        this.displayResults();
      });
    } catch (error) {
      if (this.isCancellationError(error)) {
        this.runCancelled = true;
        Logger.warning("Ripping operation cancelled.");

        if (this.exitOnCriticalError) {
          return;
        }

        throw error;
      }

      Logger.error("Critical error during ripping process", error);
      await this.ejectDiscs();
      if (this.exitOnCriticalError) {
        safeExit(1, "Critical error during ripping process");
        return;
      }

      throw error;
    }
  }

  /**
   * Process the queue of discs to rip
   * @param {Array} commandDataItems - Array of disc information objects
   * @returns {Promise<void>}
   */
  async processRippingQueue(commandDataItems) {
    if (AppConfig.rippingMode === "sync") {
      // Process discs one at a time (synchronously)
      Logger.info("Ripping discs synchronously (one at a time)...");
      for (const item of commandDataItems) {
        this.throwIfCancelled("Ripping cancelled");

        try {
          await this.ripSingleDisc(item, AppConfig.movieRipsDir);
        } catch (error) {
          if (this.isCancellationError(error)) {
            throw error;
          }

          Logger.error(`Error ripping ${item.title}`, error);
          this.badVideoArray.push(item.title);
        }
      }
    } else {
      // Process discs in parallel (asynchronously) - default behavior
      Logger.info("Ripping discs asynchronously (parallel processing)...");
      const promises = [];

      for (const item of commandDataItems) {
        const promise = this.ripSingleDisc(item, AppConfig.movieRipsDir)
          .then((result) => result)
          .catch((error) => {
            if (this.isCancellationError(error)) {
              throw error;
            }

            Logger.error(`Error ripping ${item.title}`, error);
            this.badVideoArray.push(item.title);
          });
        promises.push(promise);
      }

      try {
        await Promise.all(promises);
      } catch (error) {
        Logger.error("Uncorrectable Error Ripping One or More DVDs.", error);
        throw error;
      }
    }
  }

  /**
   * Rip a single disc
   * @param {Object} commandDataItem - Disc information object
   * @param {string} outputPath - Output directory path
   * @returns {Promise<string>} - Title of the ripped disc
   */
  async ripSingleDisc(commandDataItem, outputPath) {
    return new Promise(async (resolve, reject) => {
      try {
        this.throwIfCancelled("Ripping cancelled");

        const dir = FileSystemUtils.createUniqueFolder(
          outputPath,
          commandDataItem.title
        );

        Logger.info(`Ripping Title ${commandDataItem.title} to ${dir}...`);

        // Get MakeMKV executable path with cross-platform detection
        const makeMKVExecutable = await AppConfig.getMakeMKVExecutable();
        if (!makeMKVExecutable) {
          reject(
            new Error(
              "MakeMKV executable not found. Please ensure MakeMKV is installed."
            )
          );
          return;
        }

        const makeMKVCommand = [
          makeMKVExecutable,
          ...this.getMakeMKVReadOptions(),
          "-r",
          "--progress=-same",
          `mkv disc:${commandDataItem.driveNumber}`,
          commandDataItem.fileNumber,
          `"${dir}"`,
        ].join(" ");

        let childProcess;
        let cleanupProcess = () => {};
        const ripStartedAtMs = Date.now();

        // A long disc can emit more than exec's default 1 MB of output, and
        // exceeding maxBuffer kills makemkvcon mid-rip - hence the generous cap.
        childProcess = exec(makeMKVCommand, { maxBuffer: 1024 * 1024 * 64 }, async (err, stdout, stderr) => {
          cleanupProcess();

          if (this.cancelRequested) {
            reject(this.createCancellationError("Ripping cancelled"));
            return;
          }

          // Check for critical MakeMKV messages (not first call, so only check for errors)
          const shouldContinue = MakeMKVMessages.checkOutput(
            stdout + (stderr || ""),
            false
          );

          if (!shouldContinue) {
            Logger.error(
              "MakeMKV version is too old, please update to the latest version"
            );
            reject(
              new Error(
                "MakeMKV version is too old, please update to the latest version"
              )
            );
            return;
          }

          if (err || stderr) {
            // A hard MakeMKV failure may still be a recoverable read-error disc,
            // so try recovery on the captured output before giving up - the disc
            // is in its worst shape exactly here. attemptReadErrorRecovery does
            // its own gating (enabled, damaged rather than removed, tooling
            // present) and reports whether it actually produced a title.
            const combined = `${stdout || ""}${stderr || ""}`;
            let recovered = false;
            try {
              recovered = await this.attemptReadErrorRecovery(
                combined,
                commandDataItem,
                dir,
                Date.now() - ripStartedAtMs
              );
            } catch (recoveryError) {
              Logger.error(
                `Recovery after MakeMKV error failed for ${commandDataItem.title}`,
                recoveryError
              );
            }

            if (recovered) {
              await this.ejectCompletedDisc(commandDataItem);
              resolve(commandDataItem.title);
              return;
            }

            Logger.error(
              `Critical Error Ripping ${commandDataItem.title}`,
              err || stderr
            );
            reject(err || stderr);
            return;
          }

          try {
            await this.handleRipCompletion(stdout, commandDataItem, dir);
            await this.attemptReadErrorRecovery(
              stdout,
              commandDataItem,
              dir,
              Date.now() - ripStartedAtMs
            );
            await this.ejectCompletedDisc(commandDataItem);
            resolve(commandDataItem.title);
          } catch (error) {
            reject(error);
          }
        });

        cleanupProcess = this.registerRipProcess(childProcess);
        this.reportRipProgress(childProcess, commandDataItem, ripStartedAtMs);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Drop MakeMKV's PRG* progress chatter before a log is written to disk. It is
   * what drives the live progress messages, but thousands of lines of it would
   * bury the messages that make a saved log worth reading.
   * @param {string} stdout
   * @returns {string}
   */
  stripProgressLines(stdout) {
    return String(stdout ?? "")
      .split(/\r?\n/)
      .filter((line) => !/^PRG[VCT]:/.test(line))
      .join("\n");
  }

  /**
   * Global makemkvcon options that affect read throughput.
   * @returns {string[]}
   */
  getMakeMKVReadOptions() {
    const cacheMb = AppConfig.readCacheMb;
    return cacheMb > 0 ? [`--cache=${cacheMb}`] : [];
  }

  /**
   * Report rip progress once a minute from MakeMKV's PRGV stream.
   *
   * The timer owns the reporting, not the stream: when a drive struggles it
   * stops emitting progress altogether, and "no progress for 4m" is the most
   * useful thing the log can say at that moment.
   * @param {import('child_process').ChildProcess} childProcess
   * @param {Object} commandDataItem - Disc information object
   * @param {number} startedAtMs
   * @returns {() => void} stop function
   */
  reportRipProgress(childProcess, commandDataItem, startedAtMs) {
    if (!childProcess?.stdout) {
      return () => {};
    }

    let percent = null;
    let lastAdvanceAtMs = startedAtMs;
    let tail = "";

    childProcess.stdout.on("data", (chunk) => {
      tail = (tail + chunk.toString()).slice(-2000);

      // PRGV:<current>,<total>,<max> - the second value tracks the whole job.
      const matches = [...tail.matchAll(/PRGV:(\d+),(\d+),(\d+)/g)];
      const latest = matches[matches.length - 1];
      const max = latest ? Number.parseInt(latest[3], 10) : 0;
      if (!max) {
        return;
      }

      const current = (Number.parseInt(latest[2], 10) / max) * 100;
      if (percent === null || current > percent) {
        lastAdvanceAtMs = Date.now();
      }
      percent = current;
    });

    const heartbeat = new ProgressHeartbeat({
      describe: () => {
        const nowMs = Date.now();
        const elapsed = formatDuration(Math.round((nowMs - startedAtMs) / 1000));
        const stalledSec = Math.round((nowMs - lastAdvanceAtMs) / 1000);
        const stalled =
          stalledSec >= STALL_NOTICE_SEC
            ? ` - no progress for ${formatDuration(stalledSec)} (the drive may be retrying a damaged area)`
            : "";

        if (percent === null) {
          return `Ripping ${commandDataItem.title}: ${elapsed} elapsed, no progress reported yet${stalled}`;
        }

        return `Ripping ${commandDataItem.title}: ${percent.toFixed(
          1
        )}% - ${elapsed} elapsed${stalled}`;
      },
    });

    const stop = heartbeat.start();
    childProcess.once?.("close", stop);
    childProcess.once?.("error", stop);
    return stop;
  }

  /**
   * Try to salvage a disc whose rip hit read errors, before it is ejected.
   * @param {string} stdout - MakeMKV output from the rip
   * @param {Object} commandDataItem - Disc information object
   * @param {string} [ripDir] - Folder this disc was ripped into
   * @param {number} [ripDurationMs] - How long the rip ran
   * @returns {Promise<boolean>} whether a title was recovered
   */
  attemptReadErrorRecovery(stdout, commandDataItem, ripDir, ripDurationMs = 0) {
    return this.readErrorRecovery.attempt({
      stdout,
      disc: commandDataItem,
      // Prefer the dir we created for the rip: a whole-disc abort may never log
      // a "Saving into directory" line to parse.
      outputFolder: this.resolveOutputFolder(stdout, ripDir),
      ripDurationMs,
    });
  }

  /**
   * Handle post-rip completion tasks (logging, validation)
   * @param {string} stdout - MakeMKV output
   * @param {Object} commandDataItem - Disc information object
   * @param {string} [ripDir] - Folder this disc was ripped into
   * @returns {Promise<void>}
   */
  async handleRipCompletion(stdout, commandDataItem, ripDir) {
    if (AppConfig.isFileLogEnabled) {
      const fileName = FileSystemUtils.createUniqueLogFile(
        AppConfig.logDir,
        commandDataItem.title
      );
      try {
        await FileSystemUtils.writeLogFile(
          fileName,
          this.stripProgressLines(stdout),
          commandDataItem.title
        );
      } catch (error) {
        Logger.error("Error writing log file", error);
      }
    }

    // Verbose mode only: the raw MakeMKV messages behind the completion verdict.
    stdout
      .split("\n")
      .filter((line) => line.includes("MSG:"))
      .forEach((line) => Logger.debug(`[makemkv] ${line.trim()}`));

    const success = this.checkCopyCompletion(stdout, commandDataItem);

    if (success && this.cancelRequested) {
      Logger.info("Cancellation requested, skipping HandBrake queueing for completed rip.");
      Logger.separator();
      return;
    }

    // If rip was successful and HandBrake is enabled, queue the file for the encode phase
    if (success && AppConfig.isHandBrakeEnabled) {
      try {
        const outputFolder = this.resolveOutputFolder(stdout, ripDir);

        if (!outputFolder) {
          Logger.error("Failed to parse output directory from MakeMKV log");
          Logger.error("Relevant log lines:", stdout.split('\n').filter(line =>
            line.includes('MSG:5014') || line.includes('Saving') || line.includes('directory')));
          throw new Error("Could not find output folder in MakeMKV log");
        }

        // Verify the output folder exists
        if (!fs.existsSync(outputFolder)) {
          throw new Error(`Output folder does not exist: ${outputFolder}`);
        }

        const outputEntries = await FileSystemUtils.readdir(outputFolder);
        const mkvFiles = outputEntries.filter(file => file.toLowerCase().endsWith(".mkv"));
        if (mkvFiles.length === 0) {
          Logger.warning(`No MKV files found in output folder: ${outputFolder}`);
          Logger.separator();
          return;
        }

        this.encodeQueue.add(mkvFiles, outputFolder);
      } catch (error) {
        Logger.error("HandBrake post-processing error:", error.message);
        if (error.details) {
          Logger.error("Error details:", error.details);
        }
      }
    } else if (success) {
      Logger.info("HandBrake post-processing is disabled, skipping compression step");
    }

    Logger.separator();
  }


  /**
   * Eject a completed disc so the drive can be reused while HandBrake continues
   * @param {Object} commandDataItem - Disc information object
   * @returns {Promise<void>}
   */
  async ejectCompletedDisc(commandDataItem) {
    if (!AppConfig.isEjectDrivesEnabled) {
      return;
    }

    const ejected = await DriveService.ejectDriveByNumber(
      commandDataItem.driveNumber
    );

    if (!ejected) {
      Logger.warning(
        `Unable to automatically eject drive ${commandDataItem.driveNumber} after ripping ${commandDataItem.title}.`
      );
    }
  }

  /**
   * Snapshot of the encode pipeline, for status reporting while ripping
   * continues in parallel.
   * @returns {{active: string|null, pending: number, total: number}}
   */
  getHandBrakeStatus() {
    return this.encodeQueue.status();
  }

  /**
   * Wait for background HandBrake work to drain, without starting a worker or
   * reporting an empty queue. A worker error is rethrown once, then cleared.
   * @returns {Promise<void>}
   */
  async waitForHandBrakeQueue() {
    await this.encodeQueue.wait();
  }

  /**
   * Process queued HandBrake jobs after all ripping has completed
   * @returns {Promise<void>}
   */
  async processHandBrakeQueue() {
    await this.encodeQueue.drain();
  }

  /**
   * Check if the copy completed successfully and update results arrays
   * @param {string} data - MakeMKV output
   * @param {Object} commandDataItem - Disc information object
   */
  checkCopyCompletion(data, commandDataItem) {
    const titleName = commandDataItem.title;
    const success = ValidationUtils.isCopyComplete(data);

    if (success) {
      Logger.info(`Done Ripping ${titleName}`);
      this.goodVideoArray.push(titleName);
    } else {
      Logger.info(`Unable to rip ${titleName}. Try ripping with MakeMKV GUI.`);
      this.badVideoArray.push(titleName);
    }

    return success;
  }

  /**
   * Display the results of the ripping process
   * @param {Object} [options]
   * @param {boolean} [options.includeHandBrake=true] - Report and reset the
   *   HandBrake results too. Off while encoding runs in the background, where
   *   those results are not in yet and must survive into the next rip cycle.
   */
  displayResults({ includeHandBrake = true } = {}) {
    if (this.goodVideoArray.length > 0) {
      Logger.info(
        "The following DVD/Blu-ray titles have been successfully ripped: ",
        this.goodVideoArray.join(", ")
      );
    }

    if (this.badVideoArray.length > 0) {
      Logger.info(
        "The following DVD/Blu-ray titles failed to rip: ",
        this.badVideoArray.join(", ")
      );
    }

    // Reset arrays for next run
    this.goodVideoArray = [];
    this.badVideoArray = [];

    if (!includeHandBrake) {
      return;
    }

    this.encodeQueue.reportResults();
  }

  /**
   * Handle post-ripping actions (ejection, etc.)
   * @returns {Promise<void>}
   */
  async handlePostRipActions() {
    await this.ejectDiscs();
  }

  /**
   * Eject all DVDs if configured to do so
   * @returns {Promise<void>}
   */
  async ejectDiscs() {
    if (AppConfig.isEjectDrivesEnabled) {
      await DriveService.ejectAllDrives();
    }
  }
}
