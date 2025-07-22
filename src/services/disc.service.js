import { exec } from "child_process";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { ValidationUtils } from "../utils/validation.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { VALIDATION_CONSTANTS, MEDIA_TYPES } from "../constants/index.js";

/**
 * Service for handling disc detection and information gathering
 */
export class DiscService {
  /**
   * Get information about all available drives with discs
   * @returns {Promise<Array>} - Array of drive information objects
   */
  static async getAvailableDiscs() {
    return new Promise((resolve, reject) => {
      Logger.info("Getting info for all discs...");

      const command = `${AppConfig.makeMKVExecutable} -r info disc:index`;

      exec(command, (err, stdout, stderr) => {
        if (stderr) {
          reject(stderr);
          return;
        }

        try {
          Logger.info("Getting drive info...");
          const driveInfo = this.parseDriveInfo(stdout);

          // Get file numbers for each valid disc
          const drivePromises = driveInfo.map((drive) =>
            this.getDiscFileInfo(drive)
          );

          Promise.all(drivePromises).then(resolve).catch(reject);
        } catch (error) {
          reject(error);
        }
      });
    });
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
        return (
          lineArray[0].startsWith(VALIDATION_CONSTANTS.DRIVE_FILTER) &&
          lineArray[1] == VALIDATION_CONSTANTS.MEDIA_PRESENT
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
    return new Promise((resolve, reject) => {
      Logger.info(
        `Getting file number for drive title ${driveInfo.driveNumber}-${driveInfo.title}.`
      );

      const command = `${AppConfig.makeMKVExecutable} -r info disc:${driveInfo.driveNumber}`;

      exec(command, (err, stdout, stderr) => {
        if (stderr) {
          reject(stderr);
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

      if (videoTimeSeconds > maxValue) {
        maxValue = videoTimeSeconds;
        myTitleSectionValue = line.split(",")[0].replace("TINFO:", "");
      }
    });

    return myTitleSectionValue;
  }
}
