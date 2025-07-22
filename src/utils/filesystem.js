import fs from "fs";
import { Logger } from "./logger.js";

/**
 * Filesystem utilities for file and folder operations
 */
export class FileSystemUtils {
  /**
   * Make a title valid for use as a folder path by removing invalid characters
   * @param {string} title - The title to sanitize
   * @returns {string} - Sanitized title safe for filesystem use
   */
  static makeTitleValidFolderPath(title) {
    return title
      .replace(/\\/g, "")
      .replace(/\//g, "")
      .replace(/:/g, "")
      .replace(/\*/g, "")
      .replace(/\?/g, "")
      .replace(/</g, "")
      .replace(/>/g, "")
      .replace(/\|/g, "")
      .replace(/['"]+/g, "");
  }

  /**
   * Create a unique folder by appending a number if the folder already exists
   * @param {string} outputPath - The base path where to create the folder
   * @param {string} folderName - The desired folder name
   * @returns {string} - The full path of the created folder
   */
  static createUniqueFolder(outputPath, folderName) {
    let dir = `${outputPath}\\${folderName}`;
    let folderCounter = 1;

    if (fs.existsSync(dir)) {
      while (fs.existsSync(`${dir}-${folderCounter}`)) {
        folderCounter++;
      }
      dir += `-${folderCounter}`;
    }

    fs.mkdirSync(dir);
    return dir;
  }

  /**
   * Create a unique log file name by appending a number if the file already exists
   * @param {string} logDir - The directory where to create the log file
   * @param {string} fileName - The base file name
   * @returns {string} - The full path of the unique log file
   */
  static createUniqueLogFile(logDir, fileName) {
    let dir = `${logDir}\\Log-${fileName}`;
    let fileCounter = 1;

    if (fs.existsSync(`${dir}.txt`)) {
      while (fs.existsSync(`${dir}-${fileCounter}.txt`)) {
        fileCounter++;
      }
      dir += `-${fileCounter}`;
    }

    return `${dir}.txt`;
  }

  /**
   * Write content to a log file
   * @param {string} filePath - The full path to the log file
   * @param {string} content - The content to write
   * @param {string} titleName - The title name for logging purposes
   * @returns {Promise<void>}
   */
  static async writeLogFile(filePath, content, titleName) {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, "utf8", (err) => {
        if (err) {
          Logger.error("Directory for logs does not exist. Please create it.");
          reject(err);
        } else {
          Logger.info(
            `Full log file for ${titleName} has been written to file`
          );
          resolve();
        }
      });
    });
  }

  /**
   * Check if a directory exists, create it if it doesn't
   * @param {string} dirPath - The directory path to check/create
   */
  static ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
