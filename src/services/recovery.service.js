import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { ValidationUtils } from "../utils/validation.js";
import { MAKEMKV_READ_ERROR_MESSAGES } from "../constants/index.js";
import { formatBytes, formatDuration } from "../utils/format.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the bundled ddrescue helper script. */
const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/ddrescue-recover.sh");

/**
 * Quote a value for safe inclusion inside a single-quoted bash string.
 * @param {string|number} value
 * @returns {string}
 */
const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

/** Strips the cursor-movement escapes ddrescue uses to redraw its status block. */
const ANSI_ESCAPE = /\x1B\[[0-9;]*[A-Za-z]/g;

/** SI and binary size suffixes as printed by ddrescue ("3000 kB", "1 GiB"). */
const SIZE_UNITS = {
  B: 1,
  kB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15, EB: 1e18,
  KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4,
};

/**
 * MakeMKV reports "the disc is gone" through the same MSG:2003 read-error code
 * as a physically damaged sector. These are the giveaways that the medium was
 * removed or the tray opened mid-rip, where imaging the disc is pointless.
 */
/** How long without new data before a status line calls the operation stalled. */
export const STALL_NOTICE_SEC = 90;

const MEDIUM_ABSENT_PATTERNS = [
  "MEDIUM NOT PRESENT",
  "TRAY OPEN",
  "NO DISK",
  "NO MEDIUM",
  "NOT READY",
];

/**
 * Service for recovering titles from damaged/scratched discs using GNU ddrescue
 * via MSYS2. ddrescue images the disc while skipping unreadable areas, allowing
 * MakeMKV to re-rip the failed title(s) from the resulting image. Windows-only.
 */
export class RecoveryService {
  /**
   * Detect whether MakeMKV output indicates a title failed due to disc read errors.
   * @param {string} stdout - Raw MakeMKV output
   * @returns {boolean}
   */
  static isReadErrorFailure(stdout) {
    if (!stdout || typeof stdout !== "string") {
      return false;
    }

    const hasReadError =
      stdout.includes(MAKEMKV_READ_ERROR_MESSAGES.READ_ERROR) ||
      stdout.includes(MAKEMKV_READ_ERROR_MESSAGES.READ_ERROR_SUMMARY);

    // A read error is the necessary signal: without one this was not a damaged
    // disc and ddrescue cannot help, so never trigger recovery.
    if (!hasReadError) {
      return false;
    }

    // "Tray open" / "no disk" are reported as read errors too, but the disc is
    // gone rather than damaged - there is nothing for ddrescue to image.
    if (this.isMediumAbsentFailure(stdout)) {
      return false;
    }

    const hasTitleFailure = stdout.includes(
      MAKEMKV_READ_ERROR_MESSAGES.TITLE_SAVE_FAILED
    );

    // Trigger when a specific title failed to save, OR when the disc had read
    // errors and the rip never reported a successful completion at all (a
    // whole-disc abort, where the per-title MSG:5003 lines may be absent).
    return hasTitleFailure || !ValidationUtils.isCopyComplete(stdout);
  }

  /**
   * Whether every read error in the output says the medium went away (tray
   * opened, disc removed) rather than that a sector could not be read. Imaging
   * such a disc is pointless - and it is the signature of a disc pulled or
   * ejected mid-rip, which is worth telling the user about directly.
   * @param {string} stdout - Raw MakeMKV output
   * @returns {boolean}
   */
  static isMediumAbsentFailure(stdout) {
    const readErrorLines = this.#getReadErrorLines(stdout);
    return (
      readErrorLines.length > 0 &&
      readErrorLines.every((line) => this.#isMediumAbsentError(line))
    );
  }

  /**
   * @param {string} stdout
   * @returns {string[]} MSG:2003 read-error lines
   */
  static #getReadErrorLines(stdout) {
    if (!stdout || typeof stdout !== "string") {
      return [];
    }

    return stdout
      .split(/\r?\n/)
      .filter((line) => line.includes(MAKEMKV_READ_ERROR_MESSAGES.READ_ERROR));
  }

  /**
   * @param {string} line
   * @returns {boolean} whether the error means "no disc" rather than "bad sector"
   */
  static #isMediumAbsentError(line) {
    const upper = line.toUpperCase();
    return MEDIUM_ABSENT_PATTERNS.some((pattern) => upper.includes(pattern));
  }

  /**
   * Extract the failed source title id(s) from MakeMKV output. The MSG:5003
   * "Failed to save title" lines reference the output filename (e.g. ..._t00.mkv)
   * whose number maps directly to the MakeMKV title selector.
   * @param {string} stdout - Raw MakeMKV output
   * @returns {number[]} - Unique, ascending title ids
   */
  static getFailedTitleIds(stdout) {
    if (!stdout || typeof stdout !== "string") {
      return [];
    }

    const ids = new Set();
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.includes(MAKEMKV_READ_ERROR_MESSAGES.TITLE_SAVE_FAILED)) {
        continue;
      }
      const match = line.match(/_t(\d+)\.mkv/i);
      if (match) {
        ids.add(Number.parseInt(match[1], 10));
      }
    }

    return [...ids].sort((a, b) => a - b);
  }

  /**
   * Resolve the path to the MSYS2 bash executable.
   * @returns {string}
   */
  static getBashPath() {
    const dir = AppConfig.readErrorRecovery.msys2Dir;
    return path.win32.join(dir, "usr", "bin", "bash.exe");
  }

  /**
   * Map a MakeMKV drive number to the corresponding MSYS2 optical device node.
   * Honors an explicit full-path override (device_path) when configured.
   * @param {string|number} driveNumber
   * @returns {string}
   */
  static mapDriveToDevice(driveNumber) {
    const { devicePath, devicePrefix } = AppConfig.readErrorRecovery;
    if (devicePath) {
      return devicePath;
    }
    return `${devicePrefix}${driveNumber}`;
  }

  /**
   * Check whether MSYS2 bash, the helper script, and ddrescue are all available.
   * @returns {Promise<boolean>}
   */
  static async isAvailable() {
    if (process.platform !== "win32") {
      return false;
    }

    const bash = this.getBashPath();
    if (!fs.existsSync(bash)) {
      Logger.warning(`Read-error recovery: MSYS2 bash not found at ${bash}`);
      return false;
    }

    if (!fs.existsSync(SCRIPT_PATH)) {
      Logger.warning(`Read-error recovery: helper script not found at ${SCRIPT_PATH}`);
      return false;
    }

    const hasDdrescue = await this.#hasDdrescue(bash);
    if (!hasDdrescue) {
      Logger.warning(
        "Read-error recovery: ddrescue is not available in MSYS2. Build it from source (see scripts/ddrescue-recover.sh header)."
      );
    }
    return hasDdrescue;
  }

  /**
   * Verify ddrescue is callable inside the MSYS2 login shell.
   * @param {string} bash - Path to bash.exe
   * @returns {Promise<boolean>}
   */
  static #hasDdrescue(bash) {
    return new Promise((resolve) => {
      const child = spawn(
        bash,
        ["-lc", "command -v ddrescue >/dev/null 2>&1 && echo OK || echo MISSING"],
        { windowsHide: true }
      );
      let out = "";
      child.stdout.on("data", (data) => {
        out += data.toString();
      });
      child.on("error", () => resolve(false));
      child.on("close", () => resolve(out.includes("OK")));
    });
  }

  /**
   * Image a disc with ddrescue, skipping unreadable areas.
   * @param {string|number} driveNumber - MakeMKV drive number
   * @param {string} imagePath - Destination image path (Windows path)
   * @param {Object} [options]
   * @param {(line: string) => void} [options.onProgress] - Helper-script log lines
   * @param {(status: Object) => void} [options.onStatus] - Parsed ddrescue status snapshots
   * @param {number} [options.maxRuntimeSeconds] - Overrides the configured hard
   *   time cap, so recovery can be budgeted against how long the rip itself took
   * @param {(child: import('child_process').ChildProcess) => void} [options.onChild] - Receives the spawned process
   * @returns {Promise<{imagePath: string}>}
   */
  static recoverDiscToImage(driveNumber, imagePath, options = {}) {
    const { onProgress, onStatus, onChild } = options;

    return new Promise((resolve, reject) => {
      const bash = this.getBashPath();
      const device = this.mapDriveToDevice(driveNumber);
      const { passes, retries, timeout, maxRuntime, reversePass, direct, resume } =
        AppConfig.readErrorRecovery;
      const maxRuntimeSeconds =
        options.maxRuntimeSeconds ?? this.parseDurationToSeconds(maxRuntime);

      // Tuning is passed through the environment so the positional command stays
      // simple. The script reads DDR_* with sane defaults if any are missing.
      const env = {
        ...process.env,
        DDR_PASSES: String(passes),
        DDR_RETRIES: String(retries),
        DDR_TIMEOUT: timeout || "",
        DDR_MAX_RUNTIME: String(Math.max(0, Math.round(maxRuntimeSeconds))),
        DDR_REVERSE: reversePass ? "1" : "0",
        DDR_DIRECT: direct ? "1" : "0",
        DDR_RESUME: resume ? "1" : "0",
      };

      // Resolve the helper script to an MSYS path and strip any CR characters so
      // the script runs regardless of the checked-out line endings.
      const command =
        `script=$(cygpath -u ${shQuote(SCRIPT_PATH)}); ` +
        `bash <(tr -d '\\r' < "$script") ${shQuote(device)} ${shQuote(
          imagePath
        )}`;

      const child = spawn(bash, ["-lc", command], {
        windowsHide: true,
        env,
        // stdin is ignored so that if ddrescue ever prompts interactively (e.g.
        // on a mapfile write error) it receives EOF and aborts the pass instead
        // of blocking the rip forever waiting on input that can never arrive.
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (typeof onChild === "function") {
        onChild(child);
      }

      let stderrTail = "";
      // ddrescue redraws its six-line status block in place, so a single chunk
      // rarely holds a whole one; the parser reads from a rolling tail instead.
      let statusTail = "";

      const emitLines = (text) => {
        if (typeof onProgress !== "function") {
          return;
        }
        for (const line of text.split(/[\r\n]+/)) {
          const trimmed = line.replace(ANSI_ESCAPE, "").trim();
          if (trimmed) {
            onProgress(trimmed);
          }
        }
      };

      const handleData = (buffer, isError) => {
        const text = buffer.toString();

        if (isError) {
          stderrTail = (stderrTail + text).slice(-2000);
          emitLines(text);
          return;
        }

        // The helper script prefixes its own log lines; everything else on
        // stdout is ddrescue's status display, which is parsed rather than
        // echoed (it would otherwise flood the log several times a second).
        const scriptLines = [];
        const statusChunks = [];
        for (const line of text.split(/[\r\n]+/)) {
          if (line.includes("ddrescue-recover:")) {
            scriptLines.push(line);
          } else {
            statusChunks.push(line);
          }
        }

        emitLines(scriptLines.join("\n"));

        if (typeof onStatus === "function" && statusChunks.length > 0) {
          statusTail = (statusTail + "\n" + statusChunks.join("\n")).slice(-4000);
          const status = this.parseDdrescueStatus(statusTail);
          if (status) {
            onStatus(status);
          }
        }
      };

      child.stdout.on("data", (data) => handleData(data, false));
      child.stderr.on("data", (data) => handleData(data, true));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ imagePath });
          return;
        }

        let hint = "";
        if (code === 4) {
          // Could not read the raw device: usually no Administrator rights, no
          // media in the drive, or a disc too damaged to read even sector 0.
          hint = ` Could not read ${device} (need Administrator rights, an inserted disc, or the disc is unreadable). On Windows, run the app elevated or set ripping.recovery.device_path.`;
        } else if (code === 5) {
          hint = " ddrescue recovered no data from the disc.";
        } else if (code === 143) {
          hint = " Recovery was stopped (cancelled or max-runtime reached); the partial image was kept for resume.";
        }
        reject(
          new Error(
            `ddrescue recovery exited with code ${code}.${hint} ${stderrTail.trim()}`.trim()
          )
        );
      });
    });
  }

  /**
   * Parse ddrescue's periodic status block into a snapshot.
   *
   * ddrescue redraws six fixed lines in place using carriage returns and cursor
   * escapes, so the caller feeds in a rolling tail of recent output and every
   * field is taken from its last occurrence in that tail.
   * @param {string} text - Recent ddrescue stdout
   * @returns {{rescuedBytes: number, badBytes: number, badAreas: number,
   *   readErrors: number, nonTriedBytes: number, pctRescued: number,
   *   runTimeSec: number|null, remainingSec: number|null,
   *   currentRateBps: number|null, phase: string|null}|null} null when the text
   *   holds no status block yet
   */
  static parseDdrescueStatus(text) {
    if (!text || typeof text !== "string") {
      return null;
    }

    const clean = text.replace(ANSI_ESCAPE, "").replace(/\r/g, "\n");
    const lastMatch = (pattern) => {
      const matches = [...clean.matchAll(pattern)];
      return matches.length ? matches[matches.length - 1] : null;
    };

    const size = (label) => {
      const match = lastMatch(
        new RegExp(`${label}:\\s*([\\d.]+)\\s*([kKMGTP]?i?B)\\b`, "g")
      );
      return match ? this.parseSize(match[1], match[2]) : null;
    };
    const count = (label) => {
      const match = lastMatch(new RegExp(`${label}:\\s*(\\d+)`, "g"));
      return match ? Number.parseInt(match[1], 10) : null;
    };
    const duration = (label) => {
      const match = lastMatch(new RegExp(`${label}:\\s*([\\dhmsd\\s]+|n/a)`, "g"));
      return match ? this.parseElapsed(match[1]) : null;
    };

    const pctMatch = lastMatch(/pct rescued:\s*([\d.]+)%/g);
    const rescuedBytes = size("rescued");

    // Nothing recognisable yet - the tail is mid-block or holds other output.
    if (pctMatch === null && rescuedBytes === null) {
      return null;
    }

    const rateMatch = lastMatch(
      /current rate:\s*([\d.]+)\s*([kKMGTP]?i?B)\/s/g
    );
    const phaseMatch = lastMatch(
      /^(Copying non-tried blocks|Trimming failed blocks|Scraping failed blocks|Retrying bad sectors|Finished)/gm
    );

    return {
      rescuedBytes: rescuedBytes ?? 0,
      badBytes: size("bad-sector") ?? 0,
      badAreas: count("bad areas") ?? 0,
      readErrors: count("read errors") ?? 0,
      nonTriedBytes: size("non-tried") ?? 0,
      pctRescued: pctMatch ? Number.parseFloat(pctMatch[1]) : 0,
      runTimeSec: duration("run time"),
      remainingSec: duration("remaining time"),
      currentRateBps: rateMatch
        ? this.parseSize(rateMatch[1], rateMatch[2])
        : null,
      phase: phaseMatch ? phaseMatch[1] : null,
    };
  }

  /**
   * @param {string} value - Numeric part, e.g. "3000"
   * @param {string} unit - Suffix as printed by ddrescue, e.g. "kB"
   * @returns {number} bytes
   */
  static parseSize(value, unit) {
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * (SIZE_UNITS[unit] ?? 1));
  }

  /**
   * Parse an elapsed time as ddrescue prints it ("45s", "1m 23s", "2h 3m 4s").
   * @param {string} value
   * @returns {number|null} seconds, or null for "n/a"
   */
  static parseElapsed(value) {
    const text = String(value).trim();
    if (!text || text.startsWith("n/a")) {
      return null;
    }

    let seconds = 0;
    let matched = false;
    const units = { d: 86400, h: 3600, m: 60, s: 1 };
    for (const [, amount, unit] of text.matchAll(/(\d+)\s*([dhms])/g)) {
      seconds += Number.parseInt(amount, 10) * units[unit];
      matched = true;
    }

    return matched ? seconds : null;
  }

  /**
   * Parse a human duration ("90m", "1h", "45s", "300") into whole seconds.
   * Returns 0 for empty/invalid input (meaning "no limit").
   * @param {string} value
   * @returns {number}
   */
  static parseDurationToSeconds(value) {
    if (typeof value !== "string") {
      return 0;
    }
    const match = value.trim().match(/^(\d+)\s*([smh]?)$/i);
    if (!match) {
      return 0;
    }
    const n = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === "h") return n * 3600;
    if (unit === "m") return n * 60;
    return n; // "s" or bare number
  }

  /**
   * Summarize a ddrescue mapfile into rescued/bad/total bytes and percentages.
   * Returns null if the mapfile is missing or unparseable.
   * @param {string} mapPath
   * @returns {{rescuedBytes: number, badBytes: number, totalBytes: number, rescuedPct: number, badPct: number}|null}
   */
  static summarizeMapfile(mapPath) {
    let text;
    try {
      text = fs.readFileSync(mapPath, "utf8");
    } catch {
      return null;
    }

    let rescued = 0;
    let bad = 0;
    let total = 0;
    let sawData = false;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const parts = trimmed.split(/\s+/);
      // Block lines look like: 0x<pos> 0x<size> <status>
      if (parts.length < 3 || !/^0x/i.test(parts[1])) {
        continue;
      }
      const size = Number.parseInt(parts[1], 16);
      if (!Number.isFinite(size)) {
        continue;
      }
      sawData = true;
      total += size;
      if (parts[2] === "+") {
        rescued += size;
      } else if (parts[2] === "-") {
        bad += size;
      }
    }

    if (!sawData || total === 0) {
      return null;
    }

    return {
      rescuedBytes: rescued,
      badBytes: bad,
      totalBytes: total,
      rescuedPct: (rescued / total) * 100,
      badPct: (bad / total) * 100,
    };
  }

  /**
   * Delete abandoned recovery artifacts (*.recovery.iso/.map/.size and a stray
   * .map.bad) older than maxAgeDays in the given directory. No-op when
   * maxAgeDays <= 0 or the directory is missing. Best-effort; never throws.
   * @param {string} dir
   * @param {number} maxAgeDays
   * @param {number} [nowMs] - injectable clock for testing
   * @returns {string[]} - names of files that were deleted
   */
  static sweepStaleImages(dir, maxAgeDays, nowMs = Date.now()) {
    if (!maxAgeDays || maxAgeDays <= 0) {
      return [];
    }

    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return [];
    }

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const isArtifact = (name) =>
      /\.recovery\.iso(\.map(\.bad)?|\.size)?$/i.test(name);
    const deleted = [];

    for (const name of entries) {
      if (!isArtifact(name)) {
        continue;
      }
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (nowMs - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(full);
          deleted.push(name);
        }
      } catch {
        // Ignore files that vanish or can't be stat'd/removed.
      }
    }

    if (deleted.length > 0) {
      Logger.info(
        `Read-error recovery: swept ${deleted.length} stale recovery file(s) from ${dir}.`
      );
    }
    return deleted;
  }
}

/**
 * Turns ddrescue's once-a-second status blocks into an occasional human
 * summary, and keeps the running totals that ddrescue itself does not report -
 * most importantly how much of the wall clock has gone into damaged areas.
 *
 * Time is attributed to damaged areas when a sample shows new read errors or
 * more unreadable bytes than the one before it (the drive spent that interval
 * retrying), or when ddrescue is in a trim/scrape/retry phase, all of which
 * exist solely to work on damaged areas.
 */
export class RecoveryProgressTracker {
  /**
   * @param {Object} [options]
   * @param {number} [options.budgetSec] - Recovery time budget, for context
   * @param {() => number} [options.now] - Injectable clock
   */
  constructor(options = {}) {
    this.budgetSec = options.budgetSec ?? null;
    this.now = options.now ?? (() => Date.now());

    this.startedAtMs = this.now();
    this.lastSampleAtMs = this.startedAtMs;
    this.lastAdvanceAtMs = this.startedAtMs;
    this.damagedAreaMs = 0;
    this.latest = null;
  }

  /**
   * Record a status snapshot. Reporting is driven by a timer rather than by
   * these updates, because ddrescue stops printing while the drive is stuck on
   * a bad sector - the moment a status line matters most.
   * @param {Object} status - From RecoveryService.parseDdrescueStatus
   */
  update(status) {
    if (!status) {
      return;
    }

    const nowMs = this.now();
    const sinceLastSample = nowMs - this.lastSampleAtMs;
    this.lastSampleAtMs = nowMs;

    if (this.latest) {
      if (this.#workedOnDamage(status, this.latest)) {
        this.damagedAreaMs += sinceLastSample;
      }
      if (status.rescuedBytes > this.latest.rescuedBytes) {
        this.lastAdvanceAtMs = nowMs;
      }
    } else {
      this.lastAdvanceAtMs = nowMs;
    }

    this.latest = status;
  }

  /**
   * Final summary for when the recovery pass ends.
   * @returns {string|null}
   */
  finish() {
    return this.latest ? this.summary({ final: true }) : null;
  }

  /**
   * One line describing where the recovery has got to. Always returns something
   * once imaging has started, including while ddrescue is stalled.
   * @param {Object} [options]
   * @param {boolean} [options.final]
   * @returns {string}
   */
  summary({ final = false } = {}) {
    const nowMs = this.now();
    const wallClockSec = Math.round((nowMs - this.startedAtMs) / 1000);

    if (!this.latest) {
      return `Recovering: waiting for the first ddrescue status - ${formatDuration(
        wallClockSec
      )} elapsed`;
    }

    const status = this.latest;
    // Wall clock wins: ddrescue's own run time excludes everything around the
    // copy (setup, flushing the image), and the budget is wall-clock too, so
    // trusting ddrescue alone would under-report how long this has really taken.
    const elapsedSec = Math.max(status.runTimeSec ?? 0, wallClockSec);
    const imaged = status.rescuedBytes + status.badBytes + status.nonTriedBytes;

    const parts = [
      `${final ? "Recovery finished at" : "Recovering:"} ${status.pctRescued.toFixed(2)}% of the disc read`,
      `${formatBytes(status.rescuedBytes)}${imaged > 0 ? ` of ${formatBytes(imaged)}` : ""} recovered`,
      `${status.badAreas} damaged area(s), ${formatBytes(status.badBytes)} unreadable so far`,
      `${formatDuration(elapsedSec)} elapsed, ${formatDuration(
        Math.round(this.damagedAreaMs / 1000)
      )} of it on damaged areas`,
    ];

    if (!final && status.remainingSec !== null) {
      parts.push(`about ${formatDuration(status.remainingSec)} left`);
    }

    if (!final && this.budgetSec) {
      const remainingBudget = Math.max(0, this.budgetSec - elapsedSec);
      parts.push(`${formatDuration(remainingBudget)} of recovery budget left`);
    }

    // A drive grinding through a defect goes quiet: say so rather than
    // repeating a number that has not moved.
    const stalledSec = Math.round((nowMs - this.lastAdvanceAtMs) / 1000);
    if (!final && stalledSec >= STALL_NOTICE_SEC) {
      parts.push(
        `no new data for ${formatDuration(stalledSec)} (the drive is working on a damaged area)`
      );
    }

    return parts.join(" - ");
  }

  /**
   * @param {Object} current
   * @param {Object} previous
   * @returns {boolean} whether the interval between two samples was spent on
   *   damaged areas
   */
  #workedOnDamage(current, previous) {
    if (
      current.readErrors > previous.readErrors ||
      current.badBytes > previous.badBytes
    ) {
      return true;
    }

    return Boolean(
      current.phase &&
        /Trimming|Scraping|Retrying/.test(current.phase)
    );
  }
}

