import { exec } from "child_process";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { ValidationUtils } from "../utils/validation.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { VALIDATION_CONSTANTS, MEDIA_TYPES } from "../constants/index.js";
import { DriveService } from "./drive.service.js";

/**
 * Service for handling disc detection and information gathering
 */
export class DiscService {
  /**
   * Get information about all available drives with discs
   * @returns {Promise<Array>} - Array of drive information objects
   */
  static async getAvailableDiscs() {
    console.log("DEBUG: getAvailableDiscs() method called");
    return new Promise(async (resolve, reject) => {
      console.log("DEBUG: Inside getAvailableDiscs Promise");
      Logger.info("Getting info for all discs...");

      try {
        console.log("DEBUG: Starting getAvailableDiscsInternal()");
        // First attempt to get available discs
        let commandDataItems = await this.getAvailableDiscsInternal();
        console.log(
          "DEBUG: getAvailableDiscsInternal() returned:",
          commandDataItems.length,
          "items"
        );
        console.log("DEBUG: commandDataItems:", commandDataItems);

        // Debug: Check mount detection configuration
        const mountWaitTimeout = AppConfig.mountWaitTimeout;
        console.log(
          "DEBUG: About to check mount detection, timeout =",
          mountWaitTimeout
        );
        Logger.info(
          `Debug - Mount detection timeout configured: ${mountWaitTimeout} seconds`
        );

        console.log("DEBUG: About to enter mount detection if block");
        // Always check mount status if mount detection is enabled
        if (AppConfig.mountWaitTimeout > 0) {
          console.log("DEBUG: Inside mount detection if block");
          const mountStatus = await DriveService.getDriveMountStatus();
          Logger.info(
            `Debug - Mount status: total=${mountStatus.total}, mounted=${mountStatus.mounted}, unmounted=${mountStatus.unmounted}`
          );

          if (commandDataItems.length > 0 && mountStatus.unmounted === 0) {
            Logger.info(
              `Found ${commandDataItems.length} disc(s) immediately. All drives are ready, proceeding with ripping.`
            );
          } else if (mountStatus.unmounted > 0) {
            Logger.info(
              `Found ${commandDataItems.length} disc(s) immediately and ${mountStatus.unmounted} drive(s) still mounting. Waiting for additional drives...`
            );
            const additionalDiscs = await this.waitForDriveMount();

            // Merge any newly detected discs with existing ones
            if (additionalDiscs.length > 0) {
              commandDataItems = [...commandDataItems, ...additionalDiscs];
              Logger.info(
                `Total discs found after waiting: ${commandDataItems.length}`
              );
            }
          } else if (commandDataItems.length === 0 && mountStatus.total === 0) {
            Logger.info("No discs detected and no optical drives found.");
          } else if (commandDataItems.length === 0 && mountStatus.total > 0) {
            Logger.info(
              `Found ${mountStatus.total} optical drive(s) but no media is currently mounted.`
            );
          }
        } else {
          Logger.info(
            "Mount detection is disabled (timeout = 0) or configuration not loaded properly."
          );
        }

        resolve(commandDataItems);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Wait for drives to mount media and retry detection
   * @returns {Promise<Array>} - Array of NEW drive information objects found during wait
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
        const allCurrentDiscs = await this.getAvailableDiscsInternal();
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

        // Only exit early if there are no more unmounted drives to wait for
        if (mountStatus.unmounted === 0) {
          Logger.info(
            "All optical drives have been checked. No more drives to wait for."
          );
          return allCurrentDiscs.slice(initialDiscCount); // Return only the newly found discs
        }

        // Wait before next attempt (unless this is the last attempt)
        if (attempt < maxAttempts) {
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
      const finalDiscs = await this.getAvailableDiscsInternal();
      return finalDiscs.slice(initialDiscCount);
    } catch (error) {
      return [];
    }
  }

  /**
   * Internal method to get available discs without waiting logic
   * @returns {Promise<Array>} - Array of drive information objects
   */
  static async getAvailableDiscsInternal() {
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

      exec(command, (err, stdout, stderr) => {
        // Only fail if we have no stdout data
        if (!stdout || stdout.trim() === "") {
          Logger.error("No output from MakeMKV command");
          reject(new Error("No output from MakeMKV command"));
          return;
        }

        try {
          const driveInfo = this.parseDriveInfo(stdout);
          console.log(
            "DEBUG: parseDriveInfo returned",
            driveInfo.length,
            "drives"
          );

          // Get file numbers for each valid disc
          const drivePromises = driveInfo.map((drive) =>
            this.getDiscFileInfo(drive)
          );
          console.log(
            "DEBUG: About to wait for",
            drivePromises.length,
            "drive file info promises"
          );

          Promise.all(drivePromises)
            .then((result) => {
              console.log(
                "DEBUG: All drive file info promises completed, returning",
                result.length,
                "items"
              );
              resolve(result);
            })
            .catch(reject);
        } catch (error) {
          reject(error);
        }
      });
    });
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

      exec(command, (err, stdout, stderr) => {
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
