import { OpticalDriveUtil } from "../utils/optical-drive.js";
import { Logger } from "../utils/logger.js";

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
      await OpticalDriveUtil.loadAllDrives();
      Logger.info("All optical drives have been loaded/closed.");
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
      await OpticalDriveUtil.ejectAllDrives();
      Logger.info("All optical drives have been ejected.");
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
