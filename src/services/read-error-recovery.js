import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { formatDuration } from "../utils/format.js";
import { ProgressHeartbeat } from "../utils/heartbeat.js";
import { RecoveryService, RecoveryProgressTracker } from "./recovery.service.js";

/**
 * Recovers title(s) that MakeMKV could not rip because of physical disc read
 * errors: images the disc with ddrescue (skipping unreadable areas), re-rips
 * the failed title(s) from that image, and hands the results back for encoding.
 *
 * The ripping side owns cancellation and the encode queue, so both are injected
 * rather than reached for - this class only knows how to salvage a damaged disc.
 */
export class ReadErrorRecovery {
  /**
   * @param {Object} options
   * @param {Object} options.cancellation - Cancellation seam from the ripper
   * @param {() => boolean} options.cancellation.isCancelled
   * @param {(message?: string) => Error} options.cancellation.createError
   * @param {(error: Error) => boolean} options.cancellation.isCancellationError
   * @param {(child: import('child_process').ChildProcess) => (() => void)} options.cancellation.registerProcess
   * @param {(files: string[], outputFolder: string) => void} options.onRecoveredFiles
   */
  constructor({ cancellation, onRecoveredFiles }) {
    this.cancellation = cancellation;
    this.onRecoveredFiles = onRecoveredFiles ?? (() => {});
  }

  /** @returns {boolean} */
  get cancelRequested() {
    return this.cancellation.isCancelled();
  }

  /**
   * Attempt to salvage a disc whose rip hit read errors. No-op unless enabled in
   * config, running on Windows, and the failure really looks like disc damage.
   * Must run before the disc is ejected.
   * @param {Object} options
   * @param {string} options.stdout - MakeMKV output from the original disc rip
   * @param {Object} options.disc - Disc information object (title, driveNumber)
   * @param {string} options.outputFolder - Where the rip wrote (or would have written) titles
   * @param {number} [options.ripDurationMs] - How long the failed rip ran; the
   *   recovery time budget is derived from it
   * @returns {Promise<boolean>} whether recovery produced at least one title, so
   *   a caller handling a failed rip knows if the disc was salvaged
   */
  async attempt({ stdout, disc, outputFolder, ripDurationMs = 0 }) {
    if (!AppConfig.isReadErrorRecoveryEnabled) {
      return false;
    }

    if (RecoveryService.isMediumAbsentFailure(stdout)) {
      // The disc was pulled or the tray opened mid-rip. MakeMKV reports that as
      // a read error, but there is nothing to image and nothing to recover.
      Logger.warning(
        `${disc.title}: the drive reported no disc during the rip ` +
          "(tray opened or disc removed). Skipping read-error recovery - re-insert the disc and rip it again."
      );
      return false;
    }

    if (!RecoveryService.isReadErrorFailure(stdout)) {
      return false;
    }

    const failedIds = RecoveryService.getFailedTitleIds(stdout);
    Logger.warning(
      `Disc read error detected while ripping ${disc.title}: ` +
        `${
          failedIds.length
            ? `title(s) ${failedIds.join(", ")}`
            : "one or more titles"
        } failed to save.`
    );

    if (process.platform !== "win32") {
      Logger.warning(
        "Read-error recovery (ddrescue/MSYS2) is only supported on Windows. Skipping recovery."
      );
      return false;
    }

    if (this.cancelRequested) {
      return false;
    }

    if (!(await RecoveryService.isAvailable())) {
      Logger.warning(
        "Read-error recovery is enabled but MSYS2/ddrescue is unavailable. Skipping recovery."
      );
      return false;
    }

    if (!outputFolder || !fs.existsSync(outputFolder)) {
      Logger.error(
        "Read-error recovery: could not determine the MakeMKV output folder. Skipping recovery."
      );
      return false;
    }

    const recovery = AppConfig.readErrorRecovery;
    const imageDir = this.#prepareImageDir(recovery);
    if (!imageDir) {
      return false;
    }

    // Reap abandoned images from prior runs before we add another.
    RecoveryService.sweepStaleImages(imageDir, recovery.imageRetentionDays);

    const imagePath = path.join(imageDir, `${disc.title}.recovery.iso`);
    const mapPath = `${imagePath}.map`;

    // Refuse to run a second recovery against the same image (e.g. a second app
    // instance) - two ddrescue readers thrash one drive and cripple throughput.
    const lock = this.acquireImageLock(imagePath);
    if (!lock) {
      Logger.warning(
        `Read-error recovery for ${disc.title} is already in progress elsewhere; skipping to avoid drive contention.`
      );
      return false;
    }

    try {
      // Ensure there's room for the image before we start (a full disk mid-image
      // corrupts the partial and blocks resume).
      if (!this.hasEnoughFreeSpace(imageDir, recovery.minFreeGb)) {
        Logger.error(
          `Read-error recovery: less than ${recovery.minFreeGb} GB free in ${imageDir}; skipping to avoid filling the disk.`
        );
        return false;
      }

      // Snapshot existing MKVs (name + size + mtime) so we detect both brand-new
      // files and a same-named partial from the failed attempt being overwritten.
      const beforeFiles = await this.snapshotMkvs(outputFolder);

      if (recovery.resume && fs.existsSync(imagePath) && fs.existsSync(mapPath)) {
        Logger.info(
          `Found an existing ddrescue image and mapfile for ${disc.title}; resuming recovery instead of restarting.`
        );
      }

      const imaged = await this.#imageDisc({ disc, imagePath, ripDurationMs });
      if (!imaged) {
        return false;
      }

      if (this.cancelRequested) {
        Logger.info(`Recovery cancelled; keeping image for resume: ${imagePath}`);
        return false;
      }

      // Report how much was recovered and guard against re-ripping an image that
      // holds essentially nothing (e.g. disc yanked early).
      const summary = RecoveryService.summarizeMapfile(mapPath);
      if (summary) {
        Logger.info(
          `[ddrescue] recovered ${summary.rescuedPct.toFixed(2)}% ` +
            `(${(summary.badBytes / 1048576).toFixed(2)} MB unreadable) of ${disc.title}.`
        );
        if (summary.rescuedBytes === 0) {
          Logger.warning(
            `Read-error recovery recovered no readable data for ${disc.title}; keeping image for a later resume.`
          );
          return false;
        }
      }

      const recoveredFiles = await this.#reRipFromImage({
        disc,
        imagePath,
        outputFolder,
        beforeFiles,
        failedIds,
      });

      if (recoveredFiles.length > 0) {
        Logger.info(
          `Recovered ${recoveredFiles.length} title(s) from damaged disc ${disc.title}: ${recoveredFiles.join(", ")}`
        );
        this.onRecoveredFiles(recoveredFiles, outputFolder);
      } else {
        Logger.warning(
          `Read-error recovery did not produce any new titles for ${disc.title}.`
        );
      }

      this.cleanupArtifacts(imagePath, mapPath, {
        keepImage: recovery.keepImage,
        producedFiles: recoveredFiles.length > 0,
        hasBadSectors: Boolean(summary && summary.badBytes > 0),
      });

      return recoveredFiles.length > 0;
    } finally {
      this.releaseImageLock(lock);
    }
  }

  /**
   * Create the directory the disc image goes in: the configured working
   * directory, or a dedicated temp dir by default so multi-GB images never
   * pollute the media library.
   * @param {Object} recovery - Recovery config
   * @returns {string|null} the directory, or null if it could not be created
   */
  #prepareImageDir(recovery) {
    const imageDir =
      recovery.workDir || path.join(os.tmpdir(), "makemkv-auto-rip-recovery");

    try {
      fs.mkdirSync(imageDir, { recursive: true });
      return imageDir;
    } catch (error) {
      Logger.error(
        `Read-error recovery: could not create working directory ${imageDir}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Image the disc with ddrescue, reporting progress every minute.
   * @param {{disc: Object, imagePath: string, ripDurationMs: number}} options
   * @returns {Promise<boolean>} whether imaging completed
   */
  async #imageDisc({ disc, imagePath, ripDurationMs }) {
    const budgetSec = this.budgetSeconds(ripDurationMs);
    const tracker = new RecoveryProgressTracker({ budgetSec });
    const heartbeat = new ProgressHeartbeat({
      describe: () => `[ddrescue] ${disc.title}: ${tracker.summary()}`,
    });

    let unregisterProcess = () => {};
    let stopHeartbeat = () => {};

    try {
      Logger.info(
        `Imaging ${disc.title} with ddrescue to recover read errors. ` +
          `Budget ${formatDuration(budgetSec)} (the rip itself took ${formatDuration(
            Math.round(ripDurationMs / 1000)
          )}); progress follows every minute.`
      );
      stopHeartbeat = heartbeat.start();

      await RecoveryService.recoverDiscToImage(disc.driveNumber, imagePath, {
        maxRuntimeSeconds: budgetSec,
        onProgress: (line) =>
          Logger.info(`[ddrescue] ${line.replace(/^ddrescue-recover:\s*/, "")}`),
        onStatus: (status) => tracker.update(status),
        onChild: (child) => {
          unregisterProcess = this.cancellation.registerProcess(child);
        },
      });

      return true;
    } catch (error) {
      Logger.error(`ddrescue imaging failed for ${disc.title}: ${error.message}`);
      // Keep the partial image + mapfile so a later run can resume the unread
      // areas (e.g. after cleaning the disc) rather than starting from scratch.
      Logger.info(`Keeping partial recovery image for resume: ${imagePath}`);
      return false;
    } finally {
      stopHeartbeat();
      unregisterProcess();
      const finalSummary = tracker.finish();
      if (finalSummary) {
        Logger.info(`[ddrescue] ${disc.title}: ${finalSummary}`);
      }
    }
  }

  /**
   * Re-rip the failed title(s) from the recovered image.
   *
   * The failed-title id parsed from the output filename maps to the same MakeMKV
   * title selector, but if that assumption ever yields nothing we fall back to
   * ripping every title from the image so a recoverable title is never silently
   * lost.
   * @param {{disc: Object, imagePath: string, outputFolder: string,
   *   beforeFiles: Map<string, {size: number, mtimeMs: number}>,
   *   failedIds: number[]}} options
   * @returns {Promise<string[]>} names of the recovered MKV files
   */
  async #reRipFromImage({ disc, imagePath, outputFolder, beforeFiles, failedIds }) {
    const selectors = failedIds.length ? failedIds.map(String) : ["all"];
    await this.reRipSelectorsFromImage(imagePath, selectors, outputFolder);

    const recovered = await this.collectRecoveredMkvs(outputFolder, beforeFiles);
    if (
      recovered.length > 0 ||
      this.cancelRequested ||
      selectors.includes("all")
    ) {
      return recovered;
    }

    Logger.warning(
      `Per-title re-rip produced no new titles for ${disc.title}; falling back to ripping all titles from the recovered image.`
    );
    await this.reRipSelectorsFromImage(imagePath, ["all"], outputFolder);
    return this.collectRecoveredMkvs(outputFolder, beforeFiles);
  }

  /**
   * Work out how long recovery may spend imaging the disc.
   *
   * The budget is a multiple of the rip that just failed (default 1x, so a
   * recovered disc costs roughly twice a normal rip), clamped to a floor so a
   * rip that failed in the first minute still gets a usable attempt, and to the
   * configured absolute ceiling.
   * @param {number} ripDurationMs - How long the failed rip ran
   * @returns {number} seconds
   */
  budgetSeconds(ripDurationMs) {
    const recovery = AppConfig.readErrorRecovery;
    const ceilingSec = RecoveryService.parseDurationToSeconds(recovery.maxRuntime);
    const floorSec = RecoveryService.parseDurationToSeconds(recovery.minRuntime);
    const ripSec = Math.max(0, Math.round((ripDurationMs || 0) / 1000));

    let budget = Math.round(ripSec * (recovery.maxRuntimeRatio ?? 1));
    budget = Math.max(budget, floorSec);

    if (ceilingSec > 0) {
      budget = Math.min(budget, ceilingSec);
    }

    return budget;
  }

  /**
   * Decide what to keep after a recovery attempt. We keep the (multi-GB) image
   * only when it can still help: explicit keep_image, or a failed-but-resumable
   * attempt (no usable title produced AND bad sectors remain) so the user can
   * clean the disc and resume. A successful recovery is always cleaned up.
   * @param {string} imagePath
   * @param {string} mapPath
   * @param {{keepImage: boolean, producedFiles: boolean, hasBadSectors: boolean}} outcome
   */
  cleanupArtifacts(imagePath, mapPath, outcome) {
    if (outcome.keepImage) {
      Logger.info(`Keeping ddrescue disc image (keep_image): ${imagePath}`);
      return;
    }

    if (!outcome.producedFiles && outcome.hasBadSectors) {
      Logger.info(
        `Recovery incomplete; keeping image + mapfile so you can clean the disc and resume: ${imagePath}`
      );
      return;
    }

    this.safeUnlink(imagePath);
    this.safeUnlink(mapPath);
    this.safeUnlink(`${imagePath}.size`);
  }

  /**
   * Snapshot .mkv files in a directory as name -> {size, mtimeMs}.
   * @param {string} dir
   * @returns {Promise<Map<string, {size: number, mtimeMs: number}>>}
   */
  async snapshotMkvs(dir) {
    const map = new Map();
    for (const name of await FileSystemUtils.readdir(dir)) {
      if (!name.toLowerCase().endsWith(".mkv")) {
        continue;
      }
      map.set(name, this.statMkv(path.join(dir, name)));
    }
    return map;
  }

  /**
   * Find .mkv files that are new or changed (size/mtime) versus a snapshot.
   * Catches both freshly created titles and a same-named partial from the
   * failed attempt being overwritten by the recovered re-rip.
   * @param {string} dir
   * @param {Map<string, {size: number, mtimeMs: number}>} beforeFiles
   * @returns {Promise<string[]>}
   */
  async collectRecoveredMkvs(dir, beforeFiles) {
    const recovered = [];
    for (const name of await FileSystemUtils.readdir(dir)) {
      if (!name.toLowerCase().endsWith(".mkv")) {
        continue;
      }
      const prev = beforeFiles.get(name);
      const cur = this.statMkv(path.join(dir, name));
      if (!prev || cur.size !== prev.size || cur.mtimeMs > prev.mtimeMs) {
        recovered.push(name);
      }
    }
    return recovered;
  }

  /**
   * Stat a file, returning a sentinel instead of throwing if it is missing.
   * @param {string} filePath
   * @returns {{size: number, mtimeMs: number}}
   */
  statMkv(filePath) {
    try {
      const s = fs.statSync(filePath);
      return { size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return { size: -1, mtimeMs: 0 };
    }
  }

  /**
   * Check that a directory's filesystem has at least minFreeGb available.
   * Returns true (don't block) when free space can't be determined.
   * @param {string} dir
   * @param {number} minFreeGb
   * @returns {boolean}
   */
  hasEnoughFreeSpace(dir, minFreeGb) {
    if (!minFreeGb || minFreeGb <= 0 || typeof fs.statfsSync !== "function") {
      return true;
    }
    try {
      const { bavail, bsize } = fs.statfsSync(dir);
      const freeGb = (bavail * bsize) / 1024 ** 3;
      return freeGb >= minFreeGb;
    } catch {
      return true;
    }
  }

  /**
   * Acquire an advisory lock for an image path so two recoveries can't target
   * the same disc concurrently. A lock whose owner PID is dead is treated as
   * stale and reclaimed. Returns the lock path, or null if held by a live owner.
   * @param {string} imagePath
   * @returns {string|null}
   */
  acquireImageLock(imagePath) {
    const lockPath = `${imagePath}.lock`;
    // Exclusive create ("wx") is atomic, so two instances racing here cannot both
    // win. On EEXIST we inspect the owner: reclaim a dead one, yield to a live one.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = fs.openSync(lockPath, "wx");
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
        return lockPath;
      } catch (error) {
        if (error && error.code !== "EEXIST") {
          // Can't create a lock for some other reason; proceed unlocked rather
          // than block recovery entirely.
          return lockPath;
        }
        let pid = NaN;
        try {
          pid = Number.parseInt(fs.readFileSync(lockPath, "utf8").trim(), 10);
        } catch {
          // Unreadable lock - treat as stale below.
        }
        if (Number.isInteger(pid) && this.isPidAlive(pid)) {
          return null; // held by a live owner
        }
        this.safeUnlink(lockPath); // stale lock from a dead run - reclaim and retry
      }
    }
    return lockPath;
  }

  /**
   * Release a previously acquired image lock.
   * @param {string|null} lockPath
   */
  releaseImageLock(lockPath) {
    if (lockPath) {
      this.safeUnlink(lockPath);
    }
  }

  /**
   * @param {number} pid
   * @returns {boolean} whether the process is currently alive
   */
  isPidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error && error.code === "EPERM";
    }
  }

  /**
   * Re-rip the given MakeMKV title selectors from a recovered image, stopping
   * early if cancellation is requested. Errors are logged, not thrown.
   * @param {string} imagePath - Path to the ddrescue disc image (.iso)
   * @param {string[]} selectors - MakeMKV title selectors (ids or "all")
   * @param {string} outputFolder - Destination directory
   * @returns {Promise<void>}
   */
  async reRipSelectorsFromImage(imagePath, selectors, outputFolder) {
    for (const selector of selectors) {
      if (this.cancelRequested) {
        break;
      }
      try {
        await this.ripTitleFromImage(imagePath, selector, outputFolder);
      } catch (error) {
        if (this.cancellation.isCancellationError(error)) {
          break;
        }
        Logger.error(
          `Re-rip from recovered image failed (title ${selector}): ${error.message}`
        );
      }
    }
  }

  /**
   * Re-rip a single title (or "all") from a recovered disc image using MakeMKV.
   * @param {string} imagePath - Path to the ddrescue disc image (.iso)
   * @param {string} selector - MakeMKV title selector (id or "all")
   * @param {string} outputFolder - Destination directory
   * @returns {Promise<string>} - MakeMKV output
   */
  ripTitleFromImage(imagePath, selector, outputFolder) {
    return new Promise(async (resolve, reject) => {
      const makeMKVExecutable = await AppConfig.getMakeMKVExecutable();
      if (!makeMKVExecutable) {
        reject(
          new Error(
            "MakeMKV executable not found. Please ensure MakeMKV is installed."
          )
        );
        return;
      }

      const command = `${makeMKVExecutable} -r mkv iso:"${imagePath}" ${selector} "${outputFolder}"`;
      Logger.info(`Re-ripping title ${selector} from recovered image...`);

      let unregisterProcess = () => {};
      const childProcess = exec(
        command,
        { maxBuffer: 1024 * 1024 * 64 },
        (err, stdout) => {
          unregisterProcess();

          if (this.cancelRequested) {
            reject(this.cancellation.createError("Recovery re-rip cancelled"));
            return;
          }

          if (err) {
            reject(err);
            return;
          }

          resolve(stdout);
        }
      );

      unregisterProcess = this.cancellation.registerProcess(childProcess);
    });
  }

  /**
   * Delete a file if it exists, logging but not throwing on failure.
   * @param {string} filePath
   */
  safeUnlink(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      Logger.warning(`Could not delete ${filePath}: ${error.message}`);
    }
  }
}
