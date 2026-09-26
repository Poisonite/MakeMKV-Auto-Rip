#!/usr/bin/env node

/**
 * MakeMKV Auto Rip - Web UI Entry Point
 * Starts the web interface server
 */

import { WebService } from "./src/web/web.service.js";
import { setupErrorHandlers } from "./src/app.js";
import { Logger } from "./src/utils/logger.js";
import { AppConfig } from "./src/config/index.js";
import { queueUnconvertedFiles } from "./src/web/routes/api.routes.js";

/**
 * Main function to start the web service
 */
async function startWebUI() {
  try {
    // Validate configuration
    await AppConfig.validate();

    // Create and start web service
    const webService = new WebService();
    await webService.start();

    // Finish any encodes a previous run left behind.
    try {
      queueUnconvertedFiles();
    } catch (error) {
      Logger.error("Failed to queue unconverted MKV files", error.message);
    }

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      Logger.info("Received SIGINT, shutting down gracefully...");
      await webService.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      Logger.info("Received SIGTERM, shutting down gracefully...");
      await webService.stop();
      process.exit(0);
    });
  } catch (error) {
    Logger.error("Failed to start web UI", error.message);
    process.exit(1);
  }
}

// Setup error handlers
setupErrorHandlers();

// Start the web UI
startWebUI();
