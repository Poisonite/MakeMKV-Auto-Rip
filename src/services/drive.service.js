import winEject from "win-eject";
import { Logger } from "../utils/logger.js";

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
