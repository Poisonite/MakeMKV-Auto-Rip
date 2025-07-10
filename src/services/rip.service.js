import { exec } from "child_process";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { ValidationUtils } from "../utils/validation.js";
import { DiscService } from "./disc.service.js";
import { DriveService } from "./drive.service.js";
import { safeExit, withSystemDate } from "../utils/process.js";
import { MakeMKVMessages } from "../utils/makemkv-messages.js";

/**
 * Service for handling DVD/Blu-ray ripping operations
 */
export class RipService {
  constructor() {
    this.goodVideoArray = [];
    this.badVideoArray = [];
  }

  /**
   * Start the ripping process for all available discs
   * @returns {Promise<void>}
   */
  async startRipping() {
    try {
      // Load drives first if loading is enabled
      if (AppConfig.isLoadDrivesEnabled) {
        Logger.info("Loading drives before ripping...");
        await DriveService.loadDrivesWithWait();
      }

      // Get fake date from config and execute entire ripping operation with temporary system date
      const fakeDate = AppConfig.makeMKVFakeDate;

      await withSystemDate(fakeDate, async () => {
        Logger.info("Beginning AutoRip... Please Wait.");
        const commandDataItems = await DiscService.getAvailableDiscs();

        // Check if any discs were found
        if (commandDataItems.length === 0) {
          Logger.info(
            "No discs found to rip. No ripping operations will be performed."
          );
          Logger.separator();
          await this.handlePostRipActions();
          return;
        }

        Logger.info(
          `Found ${commandDataItems.length} disc(s) ready for ripping.`
        );
        await this.processRippingQueue(commandDataItems);
        this.displayResults();
        await this.handlePostRipActions();
      });
    } catch (error) {
      Logger.error("Critical error during ripping process", error);
      await this.ejectDiscs();
      safeExit(1, "Critical error during ripping process");
    }
  }

  /**
   * Process the queue of discs to rip
   * @param {Array} commandDataItems - Array of disc information objects
   * @returns {Promise<void>}
   */
  async processRippingQueue(commandDataItems) {
    if (AppConfig.rippingMode === "sync") {
      // Process discs one at a time (synchronously)
      Logger.info("Ripping discs synchronously (one at a time)...");
      for (const item of commandDataItems) {
        try {
          await this.ripSingleDisc(item, AppConfig.movieRipsDir);
        } catch (error) {
          Logger.error(`Error ripping ${item.title}`, error);
          this.badVideoArray.push(item.title);
        }
      }
    } else {
      // Process discs in parallel (asynchronously) - default behavior
      Logger.info("Ripping discs asynchronously (parallel processing)...");
      const promises = [];

      for (const item of commandDataItems) {
        const promise = this.ripSingleDisc(item, AppConfig.movieRipsDir)
          .then((result) => result)
          .catch((error) => {
            Logger.error(`Error ripping ${item.title}`, error);
            this.badVideoArray.push(item.title);
          });
        promises.push(promise);
      }

      try {
        await Promise.all(promises);
      } catch (error) {
        Logger.error("Uncorrectable Error Ripping One or More DVDs.", error);
        throw error;
      }
    }
  }

  /**
   * Rip a single disc
   * @param {Object} commandDataItem - Disc information object
   * @param {string} outputPath - Output directory path
   * @returns {Promise<string>} - Title of the ripped disc
   */
  async ripSingleDisc(commandDataItem, outputPath) {
    return new Promise(async (resolve, reject) => {
      const dir = FileSystemUtils.createUniqueFolder(
        outputPath,
        commandDataItem.title
      );

      Logger.info(`Ripping Title ${commandDataItem.title} to ${dir}...`);

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

      const makeMKVCommand = `${makeMKVExecutable} -r mkv disc:${commandDataItem.driveNumber} ${commandDataItem.fileNumber} "${dir}"`;

      exec(makeMKVCommand, async (err, stdout, stderr) => {
        // Check for critical MakeMKV messages (not first call, so only check for errors)
        const shouldContinue = MakeMKVMessages.checkOutput(
          stdout + (stderr || ""),
          false
        );

        if (!shouldContinue) {
          Logger.error(
            "MakeMKV version is too old, please update to the latest version"
          );
          reject(
            new Error(
              "MakeMKV version is too old, please update to the latest version"
            )
          );
          return;
        }

        if (err || stderr) {
          Logger.error(
            `Critical Error Ripping ${commandDataItem.title}`,
            err || stderr
          );
          reject(err || stderr);
          return;
        }

        try {
          await this.handleRipCompletion(stdout, commandDataItem);
          resolve(commandDataItem.title);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Handle post-rip completion tasks (logging, validation)
   * @param {string} stdout - MakeMKV output
   * @param {Object} commandDataItem - Disc information object
   * @returns {Promise<void>}
   */
  async handleRipCompletion(stdout, commandDataItem) {
    if (AppConfig.isFileLogEnabled) {
      const fileName = FileSystemUtils.createUniqueLogFile(
        AppConfig.logDir,
        commandDataItem.title
      );
      try {
        await FileSystemUtils.writeLogFile(
          fileName,
          stdout,
          commandDataItem.title
        );
      } catch (error) {
        Logger.error("Error writing log file", error);
      }
    }

    this.checkCopyCompletion(stdout, commandDataItem);
    Logger.separator();
  }

  /**
   * Check if the copy completed successfully and update results arrays
   * @param {string} data - MakeMKV output
   * @param {Object} commandDataItem - Disc information object
   */
  checkCopyCompletion(data, commandDataItem) {
    const titleName = commandDataItem.title;

    if (ValidationUtils.isCopyComplete(data)) {
      Logger.info(`Done Ripping ${titleName}`);
      this.goodVideoArray.push(titleName);
    } else {
      Logger.info(`Unable to rip ${titleName}. Try ripping with MakeMKV GUI.`);
      this.badVideoArray.push(titleName);
    }
  }

  /**
   * Display the results of the ripping process
   */
  displayResults() {
    if (this.goodVideoArray.length > 0) {
      Logger.info(
        "The following DVD/Blu-ray titles have been successfully ripped: ",
        this.goodVideoArray.join(", ")
      );
    }

    if (this.badVideoArray.length > 0) {
      Logger.info(
        "The following DVD/Blu-ray titles failed to rip: ",
        this.badVideoArray.join(", ")
      );
    }

    // Reset arrays for next run
    this.goodVideoArray = [];
    this.badVideoArray = [];
  }

  /**
   * Handle post-ripping actions (ejection, etc.)
   * @returns {Promise<void>}
   */
  async handlePostRipActions() {
    await this.ejectDiscs();
  }

  /**
   * Eject all DVDs if configured to do so
   * @returns {Promise<void>}
   */
  async ejectDiscs() {
    if (AppConfig.isEjectDrivesEnabled) {
      await DriveService.ejectAllDrives();
    }
  }
}
