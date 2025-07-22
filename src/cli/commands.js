#!/usr/bin/env node

/**
 * Command-line utilities for drive operations
 */

import { DriveService } from "../services/drive.service.js";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
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
 */
export async function loadDrives() {
  try {
    displayHeader();
    AppConfig.validate();

    Logger.info("Loading all drives...");
    await DriveService.loadDrivesWithWait();
    Logger.info("Load operation completed.");
    process.exit(0);
  } catch (error) {
    Logger.error("Failed to load drives", error.message);
    process.exit(1);
  }
}

/**
 * Eject all drives command
 */
export async function ejectDrives() {
  try {
    displayHeader();
    AppConfig.validate();

    Logger.info("Ejecting all drives...");
    await DriveService.ejectAllDrives();
    Logger.info("Eject operation completed.");
    process.exit(0);
  } catch (error) {
    Logger.error("Failed to eject drives", error.message);
    process.exit(1);
  }
}

// Handle command line arguments
const command = process.argv[2];

switch (command) {
  case "load":
    loadDrives();
    break;
  case "eject":
    ejectDrives();
    break;
  default:
    Logger.error("Invalid command. Use 'load' or 'eject'");
    process.exit(1);
}
