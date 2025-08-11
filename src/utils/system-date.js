/**
 * System date management utilities for cross-platform date manipulation
 */

import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "./logger.js";

const execAsync = promisify(exec);

/**
 * System date manager for temporarily changing system date across platforms
 */
export class SystemDateManager {
  constructor() {
    this.originalDate = null;
    this.isDateChanged = false;
  }

  /**
   * Determine if the current process has root privileges
   * @returns {boolean}
   */
  isRunningAsRoot() {
    try {
      return typeof process.getuid === "function" && process.getuid() === 0;
    } catch {
      return false;
    }
  }

  /**
   * Prefix a command with sudo when not running as root
   * Allows interactive password prompt if required
   * @param {string} command - Command to run
   * @returns {string}
   */
  withSudo(command) {
    if (this.isRunningAsRoot()) return command;
    return `sudo ${command}`;
  }

  /**
   * Format a date as local time string acceptable by timedatectl/date
   * Example: 2025-07-17 00:00:00
   * @param {Date} targetDate
   * @returns {string}
   */
  formatLocalDateTime(targetDate) {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const hour = String(targetDate.getHours()).padStart(2, "0");
    const minute = String(targetDate.getMinutes()).padStart(2, "0");
    const second = String(targetDate.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  /**
   * Get platform-specific commands for setting system date
   * @param {Date} targetDate - The date to set
   * @returns {Object} Commands for setting and restoring date
   */
  getPlatformCommands(targetDate) {
    const platform = process.platform;

    switch (platform) {
      case "win32":
        return this.getWindowsCommands(targetDate);
      case "darwin":
        return this.getMacOSCommands(targetDate);
      case "linux":
        return this.getLinuxCommands(targetDate);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get Windows date/time commands
   * @param {Date} targetDate - The date to set
   * @returns {Object} Windows commands
   */
  getWindowsCommands(targetDate) {
    const dateStr = targetDate.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const timeStr = targetDate.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return {
      setDate: `date ${dateStr} && time ${timeStr}`,
      restoreDate:
        'w32tm /config /manualpeerlist:"time.windows.com,0x1" /syncfromflags:manual /reliable:YES /update && w32tm /resync',
      requiresAdmin: true,
    };
  }

  /**
   * Get macOS date/time commands
   * @param {Date} targetDate - The date to set
   * @returns {Object} macOS commands
   */
  getMacOSCommands(targetDate) {
    // Format: MMDDHHmmYYYY (month, day, hour, minute, year)
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const hour = String(targetDate.getHours()).padStart(2, "0");
    const minute = String(targetDate.getMinutes()).padStart(2, "0");
    const year = targetDate.getFullYear();

    const dateStr = `${month}${day}${hour}${minute}${year}`;

    return {
      setDate: `sudo date -u ${dateStr}`,
      restoreDate: "sudo sntp -sS time.apple.com",
      requiresAdmin: true,
    };
  }

  /**
   * Get Linux date/time commands
   * @param {Date} targetDate - The date to set
   * @returns {Object} Linux commands
   */
  getLinuxCommands(targetDate) {
    // Use local time for Linux commands. timedatectl expects local time by default.
    const localDateStr = this.formatLocalDateTime(targetDate);

    // Prefer systemd's timedatectl when available. Fallback to date -s.
    // We also explicitly disable NTP before setting time to prevent immediate resync.
    const setUsingTimedatectl = `${this.withSudo(
      "timedatectl"
    )} set-ntp false && ${this.withSudo(
      "timedatectl"
    )} set-time "${localDateStr}"`;
    const setUsingDate = `${this.withSudo("date")} -s "${localDateStr}"`;

    const setDate = `if command -v timedatectl >/dev/null 2>&1; then ${setUsingTimedatectl}; else ${setUsingDate}; fi`;

    const restoreUsingTimedatectl = `${this.withSudo(
      "timedatectl"
    )} set-ntp true`;
    const restoreFallback = `${this.withSudo(
      "ntpdate"
    )} -s time.nist.gov || ${this.withSudo("hwclock")} -s`;
    const restoreDate = `if command -v timedatectl >/dev/null 2>&1; then ${restoreUsingTimedatectl}; else ${restoreFallback}; fi`;

    return {
      setDate,
      restoreDate,
      requiresAdmin: true,
    };
  }

  /**
   * Set system date to specified date
   * @param {Date} targetDate - The date to set
   * @returns {Promise<void>}
   */
  async setSystemDate(targetDate) {
    // Check if running in Docker container
    if (process.env.DOCKER_CONTAINER === "true") {
      Logger.warning(
        "System date management is not supported in Docker containers. " +
          "The fake_date feature will be ignored. To use a different date with MakeMKV, " +
          "please change the host system date manually before starting the container."
      );
      return;
    }

    if (this.isDateChanged) {
      Logger.warning("System date is already changed. Skipping date change.");
      return;
    }

    try {
      // Store original date
      this.originalDate = new Date();

      const commands = this.getPlatformCommands(targetDate);

      Logger.info(`Changing system date to: ${targetDate.toISOString()}`);

      const { stdout, stderr } = await execAsync(commands.setDate);

      if (stderr && stderr.trim().length > 0) {
        Logger.warning(`Date change stderr: ${stderr}`);
      }

      // Validate that the system time actually changed (allow small drift)
      const currentAfter = new Date();
      const deltaMs = Math.abs(currentAfter.getTime() - targetDate.getTime());
      if (deltaMs > 5000) {
        throw new Error(
          `Verification failed: system time (${currentAfter.toISOString()}) does not match target (${targetDate.toISOString()}).`
        );
      }

      this.isDateChanged = true;
      Logger.info(
        `System date successfully changed to: ${targetDate.toISOString()}`
      );
    } catch (error) {
      Logger.error(`Failed to change system date: ${error.message}`);
      throw new Error(`Unable to change system date: ${error.message}`);
    }
  }

  /**
   * Restore system date to network time
   * @returns {Promise<void>}
   */
  async restoreSystemDate() {
    // Check if running in Docker container
    if (process.env.DOCKER_CONTAINER === "true") {
      return;
    }

    if (!this.isDateChanged) {
      Logger.info("System date was not changed. No restoration needed.");
      return;
    }

    try {
      Logger.info("Restoring system date to network time...");

      if (process.platform === "win32") {
        // Try multiple Windows restoration methods
        await this.restoreWindowsDate();
      } else {
        // Use standard restore for Linux/macOS
        const commands = this.getPlatformCommands(new Date());
        const { stdout, stderr } = await execAsync(commands.restoreDate);

        if (stderr && !stderr.includes("successfully")) {
          Logger.warning(`Date restore stderr: ${stderr}`);
        }
      }

      this.isDateChanged = false;
      this.originalDate = null;

      Logger.info("System date successfully restored to network time");
    } catch (error) {
      Logger.error(`Failed to restore system date: ${error.message}`);
      Logger.warning(
        `You may need to manually restore your system date to network time. ` +
          `Original date was approximately: ${this.originalDate?.toISOString()}`
      );
      throw new Error(`Unable to restore system date: ${error.message}`);
    }
  }

  /**
   * Windows-specific date restoration with fallback methods
   * @returns {Promise<void>}
   */
  async restoreWindowsDate() {
    const methods = [
      // Method 1: Configure and sync with Windows time server
      'w32tm /config /manualpeerlist:"time.windows.com,0x1" /syncfromflags:manual /reliable:YES /update && w32tm /resync',

      // Method 2: Simple resync (original method)
      "w32tm /resync /force",

      // Method 3: Manual restore to original date as fallback
      this.originalDate ? this.getManualRestoreCommand() : null,
    ].filter(Boolean);

    for (let i = 0; i < methods.length; i++) {
      try {
        Logger.info(`Attempting Windows date restoration method ${i + 1}...`);
        const { stdout, stderr } = await execAsync(methods[i]);

        if (
          stderr &&
          !stderr.includes("successfully") &&
          !stderr.includes("completed")
        ) {
          Logger.warning(`Date restore method ${i + 1} stderr: ${stderr}`);
        } else {
          Logger.info(`Windows date restoration method ${i + 1} succeeded`);
          return; // Success, exit the function
        }
      } catch (error) {
        Logger.warning(
          `Windows date restoration method ${i + 1} failed: ${error.message}`
        );

        // If this is the last method, throw the error
        if (i === methods.length - 1) {
          throw error;
        }
      }
    }
  }

  /**
   * Get manual restore command for Windows fallback
   * @returns {string} Manual date restore command
   */
  getManualRestoreCommand() {
    if (!this.originalDate) return null;

    const dateStr = this.originalDate.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const timeStr = this.originalDate.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return `date ${dateStr} && time ${timeStr}`;
  }

  /**
   * Execute a function with temporary system date
   * @param {Date} targetDate - The date to set temporarily
   * @param {Function} operation - The async operation to execute
   * @returns {Promise<any>} Result of the operation
   */
  async withTemporaryDate(targetDate, operation) {
    try {
      await this.setSystemDate(targetDate);
      const result = await operation();
      return result;
    } finally {
      await this.restoreSystemDate();
    }
  }

  /**
   * Check if system date is currently changed
   * @returns {boolean}
   */
  isSystemDateChanged() {
    return this.isDateChanged;
  }
}

/**
 * Global instance for system date management
 */
export const systemDateManager = new SystemDateManager();
