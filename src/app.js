/**
 * MakeMKV Auto Rip
 * Main application logic
 */

import { CLIInterface } from "./cli/interface.js";
import { AppConfig } from "./config/index.js";
import { Logger } from "./utils/logger.js";
import { safeExit, isProcessExitError } from "./utils/process.js";

/**
 * Main application function
 */
export async function main() {
  try {
    // Validate configuration before starting
    await AppConfig.validate();

    // Start the CLI interface
    const cli = new CLIInterface();
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
