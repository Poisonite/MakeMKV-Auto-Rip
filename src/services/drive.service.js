import { Logger } from "../utils/logger.js";
import { AppConfig } from "../config/index.js";

// Conditionally import win-eject only if not in Docker
let winEject;
if (!AppConfig.isDockerEnvironment) {
  try {
    winEject = (await import("win-eject")).default;
  } catch (error) {
    Logger.warning("win-eject module not available (likely non-Windows environment)");
  }
}

/**
 * Service for handling drive operations (loading and ejecting)
 */
export class DriveService {
  constructor() {
    throw new Error(
      "DriveService is a static class and cannot be instantiated"
    );
  }

  /**
   * Load/close all DVD/Blu-ray drives
   * @returns {Promise<void>}
   */
  static async loadAllDrives() {
    if (AppConfig.isDockerEnvironment) {
      Logger.info("Drive loading skipped in Docker environment (Windows-only feature)");
      return Promise.resolve();
    }

    if (!winEject) {
      Logger.warning("Drive loading not available (win-eject module not loaded)");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        winEject.close("", () => {
          Logger.info("All drives have been loaded/closed.");
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Eject all DVD/Blu-ray drives
   * @returns {Promise<void>}
   */
  static async ejectAllDrives() {
    if (AppConfig.isDockerEnvironment) {
      Logger.info("Drive ejection skipped in Docker environment (Windows-only feature)");
      return Promise.resolve();
    }

    if (!winEject) {
      Logger.warning("Drive ejection not available (win-eject module not loaded)");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        winEject.eject("", () => {
          Logger.info("All drives have been ejected.");
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Load drives and wait with user instruction
   * @returns {Promise<void>}
   */
  static async loadDrivesWithWait() {
    await this.loadAllDrives();

    Logger.separator();
    Logger.warning("Waiting 5 seconds...");
    Logger.warning(
      "Please manually close any drives that were not automatically closed."
    );
    Logger.separator();

    await this.wait(5000);

    Logger.info("Drive loading complete. Ready to proceed.");
  }

  /**
   * Wait for a specified amount of time
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  static async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
