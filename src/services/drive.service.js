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
   * Get count of unmounted optical drives using MakeMKV detection
   * @returns {Promise<{total: number, mounted: number, unmounted: number}>}
   */
  static async getDriveMountStatus() {
    try {
      const { AppConfig } = await import("../config/index.js");
      const { exec } = await import("child_process");
      const { VALIDATION_CONSTANTS } = await import("../constants/index.js");

      // Get MakeMKV executable path
      const makeMKVExecutable = await AppConfig.getMakeMKVExecutable();
      if (!makeMKVExecutable) {
        return { total: 0, mounted: 0, unmounted: 0 };
      }

      const command = `${makeMKVExecutable} -r info disc:index`;

      return new Promise((resolve) => {
        exec(command, (err, stdout, stderr) => {
          if (stderr || err) {
            resolve({ total: 0, mounted: 0, unmounted: 0 });
            return;
          }

          try {
            const lines = stdout.split("\n");
            const allDriveLines = lines.filter((line) => {
              const lineArray = line.split(",");
              return lineArray[0].startsWith(VALIDATION_CONSTANTS.DRIVE_FILTER);
            });

            const mountedDriveLines = lines.filter((line) => {
              const lineArray = line.split(",");
              return (
                lineArray[0].startsWith(VALIDATION_CONSTANTS.DRIVE_FILTER) &&
                lineArray[1] == VALIDATION_CONSTANTS.MEDIA_PRESENT
              );
            });

            const total = allDriveLines.length;
            const mounted = mountedDriveLines.length;
            const unmounted = total - mounted;

            resolve({ total, mounted, unmounted });
          } catch (error) {
            resolve({ total: 0, mounted: 0, unmounted: 0 });
          }
        });
      });
    } catch (error) {
      return { total: 0, mounted: 0, unmounted: 0 };
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
