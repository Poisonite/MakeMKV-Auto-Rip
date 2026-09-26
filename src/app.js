/**
 * MakeMKV Auto Rip
 * Main application logic
 */

import { CLIInterface } from "./cli/interface.js";
import { AppConfig } from "./config/index.js";
import { Logger } from "./utils/logger.js";
import { safeExit, isProcessExitError } from "./utils/process.js";
import { HandBrakeService } from "./services/handbrake.service.js";

export async function prepareRipRuntime() {
  await AppConfig.validate();

  if (AppConfig.handbrake?.enabled) {
    await HandBrakeService.validate();
  }
}

/**
 * Main application function
 * @param {Object} flags - Command line flags
 * @param {boolean} flags.noConfirm - Skip confirmation prompt
 * @param {boolean} flags.quiet - Reduce verbose output
 */
export async function main(flags = {}) {
  try {
    try {
      await prepareRipRuntime();
    } catch (error) {
      Logger.error("HandBrake validation failed:", error.message);
      if (error.details) {
        Logger.error("Details:", error.details);
      }
      throw error;
    }

    // Start the CLI interface with flags
    const cli = new CLIInterface(flags);
    await cli.start();
  } catch (error) {
    // Check if this is a controlled exit from a service
    if (isProcessExitError(error)) {
      Logger.error("Application exit requested", error.message);
      safeExit(error.exitCode, error.message);
    } else {
      Logger.error("Failed to start application", error.message);
      safeExit(1, "Failed to start application");
    }
  }
}

/**
 * Setup error handlers for the application
 */
export function setupErrorHandlers() {
  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    Logger.error("Unhandled Rejection at:", promise);
    Logger.error("Reason:", reason);
    safeExit(1, "Unhandled Promise Rejection");
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    Logger.error("Uncaught Exception:", error.message);
    safeExit(1, "Uncaught Exception");
  });
}
