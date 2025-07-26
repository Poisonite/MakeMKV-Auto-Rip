import { OpticalDriveUtil } from "../utils/optical-drive.js";
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
 * Now supports Windows, macOS, and Linux optical drives
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
    try {
      const results = await OpticalDriveUtil.loadAllDrives();
      if (results.failed === 0) {
        Logger.info("All optical drives have been loaded/closed.");
      } else if (results.successful === 0) {
        Logger.warning("No optical drives could be loaded.");
      } else {
        Logger.info(
          `${results.successful} of ${results.total} optical drives loaded successfully.`
        );
      }
    } catch (error) {
      Logger.error(`Failed to load drives: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eject all DVD/Blu-ray drives
   * @returns {Promise<void>}
   */
  static async ejectAllDrives() {
    try {
      const results = await OpticalDriveUtil.ejectAllDrives();
      if (results.failed === 0) {
        Logger.info("All optical drives have been ejected.");
      } else if (results.successful === 0) {
        Logger.warning("No optical drives could be ejected.");
      } else {
        Logger.info(
          `${results.successful} of ${results.total} optical drives ejected successfully.`
        );
      }
    } catch (error) {
      Logger.error(`Failed to eject drives: ${error.message}`);
      throw error;
    }
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
   * Get information about available optical drives
   * @returns {Promise<Array<Object>>} Array of optical drive objects
   */
  static async getOpticalDrives() {
    try {
      return await OpticalDriveUtil.getOpticalDrives();
    } catch (error) {
      Logger.error(`Failed to get optical drives: ${error.message}`);
      return [];
    }
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
