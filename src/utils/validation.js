import { VALIDATION_CONSTANTS } from "../constants/index.js";

/**
 * Validation utilities for MakeMKV data
 */
export class ValidationUtils {
  /**
   * Validate MakeMKV file data output
   * @param {string} data - The raw output from MakeMKV
   * @returns {string|null} - Error message if validation fails, null if valid
   */
  static validateFileData(data) {
    if (!data || data.length === 0) {
      return "No data received from MakeMKV";
    }

    const lines = data.split("\n");
    if (lines.length <= 1) {
      return "Invalid MakeMKV output format";
    }

    // Additional validation can be added here as needed
    return null;
  }

  /**
   * Validate MakeMKV drive data output
   * @param {string} data - The raw output from MakeMKV
   * @returns {string|null} - Error message if validation fails, null if valid
   */
  static validateDriveData(data) {
    if (!data || data.length === 0) {
      return "No drive data received from MakeMKV";
    }

    const lines = data.split("\n");
    if (lines.length <= 1) {
      return "Invalid MakeMKV drive output format";
    }

    // TODO: Additional validation can be added here as needed
    return null;
  }

  /**
   * Convert time array to seconds
   * @param {string[]} timeArray - Array of [hours, minutes, seconds]
   * @returns {number} - Total time in seconds
   */
  static getTimeInSeconds(timeArray) {
    return +timeArray[0] * 60 * 60 + +timeArray[1] * 60 + +timeArray[2];
  }

  /**
   * Check if the output contains a copy complete message
   * @param {string} data - The raw output from MakeMKV
   * @returns {boolean} - True if copy completed successfully
   */
  static isCopyComplete(data) {
    const lines = data.split("\n");
    return lines.some(
      (line) =>
        line.startsWith(VALIDATION_CONSTANTS.COPY_COMPLETE_MSG) ||
        line.startsWith("Copy complete")
    );
  }
}
