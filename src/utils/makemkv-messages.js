import { Logger } from "./logger.js";
import { MAKEMKV_VERSION_MESSAGES } from "../constants/index.js";

/**
 * Utility class for handling MakeMKV command output messages
 */
export class MakeMKVMessages {
  constructor() {
    this.versionChecked = false;
  }

  /**
   * Check MakeMKV command output for critical messages
   * @param {string} output - The stdout/stderr output from makemkvcon
   * @param {boolean} isFirstCall - Whether this is the first time calling makemkvcon
   * @returns {boolean} - True if operation should continue, false if should stop
   */
  static checkOutput(output, isFirstCall = false) {
    if (!output || typeof output !== "string") {
      return true;
    }

    const lines = output.split("\n");
    let shouldContinue = true;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      // Check for version too old error (always check)
      if (trimmedLine.includes(MAKEMKV_VERSION_MESSAGES.VERSION_TOO_OLD)) {
        Logger.error(
          "The installed version of MakeMKV is too old, please update to the latest version"
        );
        return false; // Stop all operations
      }

      // Only check version info and update available on first call
      if (isFirstCall) {
        // Check for version info
        if (trimmedLine.includes(MAKEMKV_VERSION_MESSAGES.VERSION_INFO)) {
          this.logVersionInfo(trimmedLine);
        }

        // Check for update available
        if (trimmedLine.includes(MAKEMKV_VERSION_MESSAGES.UPDATE_AVAILABLE)) {
          Logger.warning(
            "There's a new version of MakeMKV available, it's highly recommended to update to the latest version to avoid any potential bugs."
          );
        }
      }
    }

    return shouldContinue;
  }

  /**
   * Parse and log version information from MakeMKV output
   * @param {string} line - The line containing version information
   */
  static logVersionInfo(line) {
    try {
      // Parse the MSG:1005 format: MSG:1005,0,1,"MakeMKV v1.18.1 linux(x64-release) started","%1 started","MakeMKV v1.18.1 linux(x64-release)"
      const parts = line.split(",");
      // Extract the version string from the last part (index 5)
      const versionString = parts[5].replace(/"/g, ""); // Remove quotes
      Logger.info(`${versionString} is installed`);
    } catch (error) {
      Logger.error(`Error parsing MakeMKV version info: ${error.message}`);
    }
  }

  /**
   * Check if the output contains any critical errors that should stop operations
   * @param {string} output - The stdout/stderr output from makemkvcon
   * @returns {boolean} - True if operation should continue, false if should stop
   */
  static hasCriticalErrors(output) {
    if (!output || typeof output !== "string") {
      return false;
    }

    const lines = output.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      // Check for version too old error
      if (trimmedLine.includes(MAKEMKV_VERSION_MESSAGES.VERSION_TOO_OLD)) {
        return true;
      }
    }

    return false;
  }
}
