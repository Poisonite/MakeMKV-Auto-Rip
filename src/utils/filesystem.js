import fs from "fs";
import path, { join } from "path";
import { Logger } from "./logger.js";
import { PLATFORM_DEFAULTS } from "../constants/index.js";
import { access, readdir } from "fs/promises";
import os from "os";

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
    let dir = join(outputPath, folderName);
    let folderCounter = 1;

    if (fs.existsSync(dir)) {
      while (fs.existsSync(`${dir}-${folderCounter}`)) {
        folderCounter++;
      }
      dir += `-${folderCounter}`;
    }

    // Recursive so a configured media directory that does not exist yet is
    // created rather than failing the rip with ENOENT.
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Read the contents of a directory
   * @param {string} dirPath - The path to the directory to read
   * @returns {Promise<string[]>} - Array of file/directory names in the directory
   */
  static async readdir(dirPath) {
    try {
      const files = await readdir(dirPath);
      Logger.debug(`Read ${files.length} entries from ${dirPath}`);
      return files;
    } catch (error) {
      Logger.error(`Error reading directory ${dirPath}:`, error);
      throw error;
    }
  }

  /**
   * List the MKV files in a folder, walking subfolders unless told not to.
   * Directory symlinks are not followed, so a link loop cannot hang the walk.
   * @param {string} folder - Absolute path to search
   * @param {boolean} [recurse] - Whether to descend into subfolders
   * @returns {string[]} Absolute paths, alphabetical, each folder's own files before
   *   the contents of its subfolders
   */
  static collectMkvFiles(folder, recurse = true) {
    const found = [];

    const walk = (dir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        Logger.warning(`Skipping unreadable folder ${dir}: ${error.message || error}`);
        return;
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));

      const subfolders = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          subfolders.push(full);
        } else if (entry.name.toLowerCase().endsWith(".mkv")) {
          found.push(full);
        }
      }

      if (recurse) {
        subfolders.forEach(walk);
      }
    };

    walk(folder);
    return found;
  }

  /**
   * MKV files under the rips folder that are ready for HandBrake: left over by
   * an encode that never ran, was interrupted, or failed. With delete_original
   * on, a converted MKV is deleted, so any MKV still here is unconverted.
   *
   * Empty files (a rip that died at once) and recently written ones (possibly
   * still being written by MakeMKV) are skipped.
   * @param {string} folder - Rips folder to search, subfolders included
   * @param {Object} [options]
   * @param {number} [options.minAgeMs=120000] - How long a file must have gone
   *   unmodified before it counts as finished
   * @param {number} [options.now=Date.now()]
   * @param {string|null} [options.skipIfConvertedTo] - Output extension (e.g.
   *   "mp4"). When set, an MKV with that output beside it counts as converted.
   *   Needed when originals are kept, or every restart would re-encode them.
   * @returns {string[]} Absolute paths
   */
  static findUnconvertedMkvFiles(
    folder,
    { minAgeMs = 120000, now = Date.now(), skipIfConvertedTo = null } = {}
  ) {
    if (!fs.existsSync(folder)) {
      return [];
    }

    return FileSystemUtils.collectMkvFiles(folder).filter((file) => {
      let stats;
      try {
        stats = fs.statSync(file);
      } catch {
        return false;
      }

      if (stats.size === 0) {
        Logger.warning(`Skipping empty MKV file (failed rip?): ${file}`);
        return false;
      }

      if (now - stats.mtimeMs < minAgeMs) {
        Logger.info(`Skipping MKV file that is still being written: ${file}`);
        return false;
      }

      if (skipIfConvertedTo) {
        const output = file.replace(/\.mkv$/i, `.${skipIfConvertedTo}`);
        if (fs.existsSync(output)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Delete a file asynchronously
   * @param {string} filePath - The path to the file to delete
   * @returns {Promise<void>}
   */
  static async unlink(filePath) {
    try {
      await fs.promises.unlink(filePath);
      Logger.debug(`Deleted file: ${filePath}`);
    } catch (error) {
      Logger.error(`Error deleting file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Create a unique log file name by appending a number if the file already exists
   * @param {string} logDir - The directory where to create the log file
   * @param {string} fileName - The base file name
   * @returns {string} - The full path of the unique log file
   */
  static createUniqueLogFile(logDir, fileName) {
    let dir = join(logDir, `Log-${fileName}`);
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
   * Detect MakeMKV installation path for the current platform
   * @returns {Promise<string|null>} - Path to MakeMKV directory or null if not found
   */
  static async detectMakeMKVInstallation() {
    const platform = os.platform();
    const platformPaths = PLATFORM_DEFAULTS.MAKEMKV_PATHS[platform];

    if (!platformPaths) {
      Logger.warning(`Unsupported platform: ${platform}`);
      return null;
    }

    for (const basePath of platformPaths) {
      try {
        // Check if the directory exists
        await access(basePath);

        // Check if makemkvcon executable exists in this path
        const executableName =
          platform === "win32" ? "makemkvcon.exe" : "makemkvcon";
        const executablePath = join(basePath, executableName);

        try {
          await access(executablePath);
          Logger.info(`Found MakeMKV installation at: ${basePath}`);
          return basePath;
        } catch {
          // Executable not found in this directory, try next
          continue;
        }
      } catch {
        // Directory doesn't exist, try next
        continue;
      }
    }

    Logger.warning(
      `MakeMKV installation not found in default locations for ${platform}`
    );
    return null;
  }

  /**
   * Validate that MakeMKV executable exists at given path
   * @param {string} mkvDir - Path to MakeMKV directory
   * @returns {Promise<boolean>} - True if executable exists
   */
  static async validateMakeMKVInstallation(mkvDir) {
    if (!mkvDir) return false;

    try {
      const platform = os.platform();
      const executableName =
        platform === "win32" ? "makemkvcon.exe" : "makemkvcon";
      const executablePath = join(mkvDir, executableName);

      await access(executablePath);
      return true;
    } catch {
      return false;
    }
  }
}
