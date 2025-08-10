import { exec } from "child_process";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { ValidationUtils } from "../utils/validation.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { VALIDATION_CONSTANTS, MEDIA_TYPES } from "../constants/index.js";
import { DriveService } from "./drive.service.js";
import { MakeMKVMessages } from "../utils/makemkv-messages.js";
import { createDateEnvironment } from "../utils/process.js";

/**
 * Service for handling disc detection and information gathering
 */
export class DiscService {
  static isFirstMakeMKVCall = true;

  /**
   * Main method: Get all available discs with mount detection and complete title processing
   * @returns {Promise<Array>} - Array of complete drive information objects
   */
  static async getAvailableDiscs() {
    return new Promise(async (resolve, reject) => {
      Logger.info("Getting info for all discs...");

      try {
        // First: Detect any immediately available discs (without processing)
        let detectedDiscs = await this.detectAvailableDiscs();

        // Check for additional drives if mount detection is enabled
        if (AppConfig.mountWaitTimeout > 0) {
          const mountStatus = await DriveService.getDriveMountStatus();

          if (detectedDiscs.length > 0 && mountStatus.unmounted === 0) {
            Logger.info(
              `Found ${detectedDiscs.length} disc(s) immediately. All drives are ready, proceeding with ripping.`
            );
          } else if (mountStatus.unmounted > 0) {
            Logger.info(
              `Found ${detectedDiscs.length} disc(s) immediately and ${mountStatus.unmounted} drive(s) still mounting. Waiting for additional drives...`
            );
            const additionalDiscs = await this.waitForDriveMount();

            // Merge any newly detected discs with existing ones
            if (additionalDiscs.length > 0) {
              detectedDiscs = [...detectedDiscs, ...additionalDiscs];
              Logger.info(
                `Total discs found after waiting: ${detectedDiscs.length}`
              );
            }
          } else if (detectedDiscs.length === 0 && mountStatus.total === 0) {
            Logger.info("No discs detected and no optical drives found.");
          } else if (detectedDiscs.length === 0 && mountStatus.total > 0) {
            Logger.info(
              `Found ${mountStatus.total} optical drive(s) but no media is currently mounted.`
            );
          }
        }

        // Finally: Process complete disc information for ALL discovered discs
        if (detectedDiscs.length > 0) {
          Logger.separator();
          Logger.info(
            `Processing complete disc information for ${detectedDiscs.length} disc(s)...`
          );
          const completeDiscInfo = await this.getCompleteDiscInfo(
            detectedDiscs
          );
          resolve(completeDiscInfo);
        } else {
          resolve([]);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Detect available discs without processing file information (fast)
   * @returns {Promise<Array>} - Array of basic disc information objects
   */
  static async detectAvailableDiscs() {
    return new Promise(async (resolve, reject) => {
      // Get MakeMKV executable path with cross-platform detection
      const makeMKVExecutable = await AppConfig.getMakeMKVExecutable();
      if (!makeMKVExecutable) {
        reject(
          new Error(
            "MakeMKV executable not found. Please ensure MakeMKV is installed."
          )
        );
        return;
      }

      const command = `${makeMKVExecutable} -r info disc:index`;

      // Create environment with fake date if configured
      const fakeDate = AppConfig.makeMKVFakeDate;
      const env = { ...process.env, ...createDateEnvironment(fakeDate) };

      exec(command, { env }, (err, stdout, stderr) => {
        // Check for critical MakeMKV messages first
        const isFirstCall = DiscService.isFirstMakeMKVCall;
        const shouldContinue = MakeMKVMessages.checkOutput(
          stdout + (stderr || ""),
          isFirstCall
        );

        if (!shouldContinue) {
          reject(
            new Error(
              "MakeMKV version is too old, please update to the latest version"
            )
          );
          return;
        }

        // Mark that we've made our first call
        if (isFirstCall) {
          DiscService.isFirstMakeMKVCall = false;
        }

        // Only fail if we have no stdout data
        if (!stdout || stdout.trim() === "") {
          Logger.error("No output from MakeMKV command");
          reject(new Error("No output from MakeMKV command"));
          return;
        }

        try {
          const driveInfo = this.parseDriveInfo(stdout);
          resolve(driveInfo);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Get complete disc information including file numbers for all discs
   * @param {Array} detectedDiscs - Array of basic disc information
   * @returns {Promise<Array>} - Array of complete disc information with file numbers
   */
  static async getCompleteDiscInfo(detectedDiscs) {
    // Get file numbers for each detected disc
    const drivePromises = detectedDiscs.map((drive) =>
      this.getDiscFileInfo(drive)
    );

    return Promise.all(drivePromises);
  }

  /**
   * Wait for drives to mount media and retry detection
   * @returns {Promise<Array>} - Array of basic disc information for newly found discs
   */
  static async waitForDriveMount() {
    const waitTimeout = AppConfig.mountWaitTimeout;
    const pollInterval = AppConfig.mountPollInterval;
    const maxAttempts = Math.ceil(waitTimeout / pollInterval);

    Logger.info(
      `Waiting up to ${waitTimeout} seconds for additional drives to mount media...`
    );

    let initialDiscCount = 0;

    // Poll for mounted drives
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      Logger.info(
        `Polling attempt ${attempt}/${maxAttempts} for newly mounted drives...`
      );

      try {
        // Use fast detection during polling (no file processing)
        const allCurrentDiscs = await this.detectAvailableDiscs();
        const mountStatus = await DriveService.getDriveMountStatus();

        // Set initial count on first attempt
        if (attempt === 1) {
          initialDiscCount = allCurrentDiscs.length;
        }

        const newDiscsFound = allCurrentDiscs.length - initialDiscCount;

        if (newDiscsFound > 0) {
          Logger.info(
            `Found ${newDiscsFound} additional disc(s) during polling.`
          );
        }

        Logger.info(
          `Current status: ${allCurrentDiscs.length} discs ready, ${mountStatus.unmounted} drives still mounting`
        );

        // Only exit when there are no more unmounted drives to wait for
        if (mountStatus.unmounted === 0) {
          Logger.info(
            "All optical drives have been checked. No more drives to wait for."
          );

          // Return just the newly found basic disc info (processing happens later)
          const newDiscs = allCurrentDiscs.slice(initialDiscCount);
          return newDiscs;
        }

        // Wait before next attempt (unless this is the last attempt)
        if (attempt < maxAttempts) {
          Logger.separator();
          await this.sleep(pollInterval * 1000);
        }
      } catch (error) {
        Logger.warning(
          `Error during polling attempt ${attempt}: ${error.message}`
        );
      }
    }

    Logger.info(
      `Finished waiting ${waitTimeout} seconds for additional drives.`
    );

    // Return any newly found discs after timeout
    try {
      const finalDiscs = await this.detectAvailableDiscs();
      const newDiscs = finalDiscs.slice(initialDiscCount);
      return newDiscs;
    } catch (error) {
      return [];
    }
  }

  /**
   * Sleep for the specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse drive information from MakeMKV output
   * @param {string} data - Raw MakeMKV output
   * @returns {Array} - Array of drive information objects
   */
  static parseDriveInfo(data) {
    const validationMessage = ValidationUtils.validateDriveData(data);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const lines = data.split("\n");

    return lines
      .filter((line) => {
        const lineArray = line.split(",");
        const driveState = parseInt(lineArray[1]);
        const mediaTitle = lineArray[5] || "";

        return (
          lineArray[0].startsWith(VALIDATION_CONSTANTS.DRIVE_FILTER) &&
          driveState == VALIDATION_CONSTANTS.MEDIA_PRESENT &&
          mediaTitle.trim() !== ""
        );
      })
      .map((line) => {
        const lineArray = line.split(",");
        const mediaType = lineArray[4].includes("BD-ROM")
          ? MEDIA_TYPES.BLU_RAY
          : MEDIA_TYPES.DVD;

        return {
          driveNumber: lineArray[0].substring(4),
          title: FileSystemUtils.makeTitleValidFolderPath(lineArray[5]),
          mediaType: mediaType,
        };
      });
  }

  /**
   * Get file information for a specific disc
   * @param {Object} driveInfo - Drive information object
   * @returns {Promise<Object>} - Enhanced drive info with file number
   */
  static async getDiscFileInfo(driveInfo) {
    return new Promise(async (resolve, reject) => {
      Logger.info(
        `Getting file number for drive title ${driveInfo.driveNumber}-${driveInfo.title}.`
      );

      // Get MakeMKV executable path with cross-platform detection
      const makeMKVExecutable = await AppConfig.getMakeMKVExecutable();
      if (!makeMKVExecutable) {
        reject(
          new Error(
            "MakeMKV executable not found. Please ensure MakeMKV is installed."
          )
        );
        return;
      }

      const command = `${makeMKVExecutable} -r info disc:${driveInfo.driveNumber}`;

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
          reject(
            new Error(
              "MakeMKV version is too old, please update to the latest version"
            )
          );
          return;
        }

        // Only fail if we have no stdout data
        if (!stdout || stdout.trim() === "") {
          Logger.error("No output from MakeMKV command");
          reject(new Error("No output from MakeMKV command"));
          return;
        }

        try {
          const fileNumber = AppConfig.isRipAllEnabled
            ? "all"
            : this.getFileNumber(stdout);

          Logger.info(
            `Got file info for ${driveInfo.driveNumber}-${driveInfo.title}.`
          );

          resolve({
            driveNumber: driveInfo.driveNumber,
            title: driveInfo.title,
            fileNumber: fileNumber,
            mediaType: driveInfo.mediaType,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Get the file number for the longest title on the disc
   * @param {string} data - Raw MakeMKV output
   * @returns {string} - File number of the longest title
   */
  static getFileNumber(data) {
    const validationMessage = ValidationUtils.validateFileData(data);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    let myTitleSectionValue = null;
    let maxValue = 0;

    const lines = data.split("\n");
    const validLines = lines.filter((line) => {
      const lineArray = line.split(",");
      return (
        lineArray[0].startsWith("TINFO:") &&
        lineArray[1] == VALIDATION_CONSTANTS.TITLE_LENGTH_CODE
      );
    });

    validLines.forEach((line) => {
      const videoTimeString = line.split(",")[3].replace(/['"]+/g, "");
      const videoTimeArray = videoTimeString.split(":");
      const videoTimeSeconds = ValidationUtils.getTimeInSeconds(videoTimeArray);

      if (videoTimeSeconds >= maxValue) {
        maxValue = videoTimeSeconds;
        myTitleSectionValue = line.split(",")[0].replace("TINFO:", "");
      }
    });

    return myTitleSectionValue || "0";
  }
}
