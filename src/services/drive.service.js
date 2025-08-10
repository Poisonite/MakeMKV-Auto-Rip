import { OpticalDriveUtil } from "../utils/optical-drive.js";
import { Logger } from "../utils/logger.js";
import { VALIDATION_CONSTANTS } from "../constants/index.js";
import { MakeMKVMessages } from "../utils/makemkv-messages.js";
import { createDateEnvironment } from "../utils/process.js";

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

    const { AppConfig } = await import("../config/index.js");
    const delaySeconds = AppConfig.driveLoadDelay;

    if (delaySeconds > 0) {
      Logger.separator();
      Logger.warning(`Waiting ${delaySeconds} seconds...`);
      Logger.warning(
        "Please manually close any drives that were not automatically closed."
      );
      Logger.separator();

      await this.wait(delaySeconds * 1000);
    }

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

      // Get MakeMKV executable path
      const makeMKVExecutable = await AppConfig.getMakeMKVExecutable();
      if (!makeMKVExecutable) {
        return { total: 0, mounted: 0, unmounted: 0 };
      }

      const command = `${makeMKVExecutable} -r info disc:index`;

      return new Promise((resolve) => {
        // Create environment with fake date if configured
        const fakeDate = AppConfig.makeMKVFakeDate;
        const env = { ...process.env, ...createDateEnvironment(fakeDate) };

        exec(command, { env }, (err, stdout, stderr) => {
          // Check for critical MakeMKV messages (not first call, so only check for errors)
          const shouldContinue = MakeMKVMessages.checkOutput(
            stdout + (stderr || ""),
            false
          );

          if (!shouldContinue) {
            Logger.error(
              "MakeMKV version is too old, please update to the latest version"
            );
            resolve({ total: 0, mounted: 0, unmounted: 0 });
            return;
          }

          // Don't treat stderr as fatal error - MakeMKV often writes warnings there
          // Only fail if we have no stdout data or a critical exec error
          if (!stdout || stdout.trim() === "") {
            Logger.error("No output from MakeMKV command");
            resolve({ total: 0, mounted: 0, unmounted: 0 });
            return;
          }

          try {
            const lines = stdout.split("\n");

            // Filter for actual optical drives (exclude virtual slots with state 256)
            const realDriveLines = lines.filter((line) => {
              const lineArray = line.split(",");
              if (!lineArray[0].startsWith(VALIDATION_CONSTANTS.DRIVE_FILTER))
                return false;

              const driveState = parseInt(lineArray[1]);
              // State 0 = Physical drive present, closed, no media/empty
              // State 1 = Physical drive present but open/ejected
              // State 2 = Physical drive with media present and mounted
              // State 3 = Physical drive loaded but still processing (OS mounting)
              // State 256 = No physical drive (virtual slot)
              return driveState !== 256;
            });

            // Count drives with mounted media (state 2 AND has media title)
            const mountedDriveLines = realDriveLines.filter((line) => {
              const lineArray = line.split(",");
              const driveState = parseInt(lineArray[1]);
              const mediaTitle = lineArray[5] || "";

              // Drive is considered "mounted" if state is 2 AND has a media title
              return (
                driveState === VALIDATION_CONSTANTS.MEDIA_PRESENT &&
                mediaTitle.trim() !== ""
              );
            });

            const total = realDriveLines.length;
            const mounted = mountedDriveLines.length;
            const unmounted = total - mounted;

            Logger.info(
              `Drive status: ${total} drives, ${mounted} with mounted media, ${unmounted} available for mounting`
            );
            Logger.separator();

            resolve({ total, mounted, unmounted });
          } catch (error) {
            Logger.error(`Error parsing drive mount status: ${error.message}`);
            resolve({ total: 0, mounted: 0, unmounted: 0 });
          }
        });
      });
    } catch (error) {
      Logger.error(`Failed to get drive mount status: ${error.message}`);
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
