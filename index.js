#!/usr/bin/env node

/**
 * MakeMKV Auto Rip
 * Main entry point for the application
 */

import { CLIInterface } from "./src/cli/interface.js";
import { AppConfig } from "./src/config/index.js";
import { Logger } from "./src/utils/logger.js";

/**
 * Main application function
 */
async function main() {
  try {
    // Validate configuration before starting
    AppConfig.validate();

    // Start the CLI interface
    const cli = new CLIInterface();
    await cli.start();
  } catch (error) {
    Logger.error("Failed to start application", error.message);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  Logger.error("Unhandled Rejection at:", promise);
  Logger.error("Reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  Logger.error("Uncaught Exception:", error.message);
  process.exit(1);
});

// Start the application
main();
