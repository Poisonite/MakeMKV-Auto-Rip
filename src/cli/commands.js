#!/usr/bin/env node

/**
 * Command-line utilities for drive operations
 */

import { DriveService } from "../services/drive.service.js";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { safeExit } from "../utils/process.js";
import { APP_INFO } from "../constants/index.js";

/**
 * Display header for command utilities
 */
function displayHeader() {
  Logger.header(`${APP_INFO.name} v${APP_INFO.version} - Drive Utilities`);
  Logger.separator();
}

/**
 * Load all drives command
 * @param {Object} flags - Command flags
 * @param {boolean} flags.quiet - Reduce verbose output
 */
export async function loadDrives(flags = {}) {
  try {
    if (!flags.quiet) {
      displayHeader();
    }
    AppConfig.validate();

    if (!flags.quiet) {
      Logger.info("Loading all drives...");
    }
    await DriveService.loadDrivesWithWait();
    if (!flags.quiet) {
      Logger.info("Load operation completed.");
    }
    safeExit(0, "Load operation completed");
  } catch (error) {
    Logger.error("Failed to load drives", error.message);
    safeExit(1, "Failed to load drives");
  }
}

/**
 * Eject all drives command
 * @param {Object} flags - Command flags
 * @param {boolean} flags.quiet - Reduce verbose output
 */
export async function ejectDrives(flags = {}) {
  try {
    if (!flags.quiet) {
      displayHeader();
    }
    AppConfig.validate();

    if (!flags.quiet) {
      Logger.info("Ejecting all drives...");
    }
    await DriveService.ejectAllDrives();
    if (!flags.quiet) {
      Logger.info("Eject operation completed.");
    }
    safeExit(0, "Eject operation completed");
  } catch (error) {
    Logger.error("Failed to eject drives", error.message);
    safeExit(1, "Failed to eject drives");
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const flags = {
  quiet: args.includes("--quiet"),
};

switch (command) {
  case "load":
    loadDrives(flags);
    break;
  case "eject":
    ejectDrives(flags);
    break;
  default:
    Logger.error("Invalid command. Use 'load' or 'eject'");
    safeExit(1, "Invalid command");
}
