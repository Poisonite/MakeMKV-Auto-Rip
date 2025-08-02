/**
 * MakeMKV Auto Rip - Web API Routes
 * Handles all API endpoints for the web interface
 */

import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { AppConfig } from "../../config/index.js";
import { Logger } from "../../utils/logger.js";
import {
  broadcastStatusUpdate,
  broadcastLogMessage,
} from "../middleware/websocket.middleware.js";

const router = Router();

// Status tracking
let currentOperation = null;
let operationStatus = "idle"; // idle, loading, ejecting, ripping

/**
 * Execute a CLI command and capture its output
 * @param {string} command - Command to execute
 * @param {Array} args - Command arguments
 * @returns {Promise<{success: boolean, output: string, error?: string}>}
 */
function executeCliCommand(command, args = []) {
  return new Promise((resolve) => {
    const childProcess = spawn(command, args, {
      cwd: path.resolve(process.cwd()),
      shell: true,
    });

    let output = "";
    let error = "";

    childProcess.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      // Broadcast real program output to WebSocket clients
      broadcastLogMessage("info", text.trim());
    });

    childProcess.stderr.on("data", (data) => {
      const text = data.toString();
      error += text;
      // Broadcast errors to WebSocket clients
      broadcastLogMessage("error", text.trim());
    });

    childProcess.on("close", (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim(),
      });
    });

    childProcess.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        error: err.message,
      });
    });
  });
}

/**
 * Get current system status
 */
router.get("/status", async (req, res) => {
  try {
    res.json({
      operation: currentOperation,
      status: operationStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Logger.error("Failed to get status", error.message);
    res.status(500).json({ error: "Failed to get status" });
  }
});

/**
 * Load all drives using CLI command
 */
router.post("/drives/load", async (req, res) => {
  try {
    if (operationStatus !== "idle") {
      return res
        .status(409)
        .json({ error: "Another operation is in progress" });
    }

    operationStatus = "loading";
    currentOperation = "Loading drives...";
    broadcastStatusUpdate("loading", "Loading drives...");

    const result = await executeCliCommand("npm", ["run", "load"]);

    operationStatus = "idle";
    currentOperation = null;
    broadcastStatusUpdate("idle", null);

    if (result.success) {
      res.json({ success: true, message: "Drives loaded successfully" });
    } else {
      res.status(500).json({ error: "Failed to load drives: " + result.error });
    }
  } catch (error) {
    operationStatus = "idle";
    currentOperation = null;
    broadcastStatusUpdate("idle", null);
    Logger.error("Failed to load drives", error.message);
    res.status(500).json({ error: "Failed to load drives: " + error.message });
  }
});

/**
 * Eject all drives using CLI command
 */
router.post("/drives/eject", async (req, res) => {
  try {
    if (operationStatus !== "idle") {
      return res
        .status(409)
        .json({ error: "Another operation is in progress" });
    }

    operationStatus = "ejecting";
    currentOperation = "Ejecting drives...";
    broadcastStatusUpdate("ejecting", "Ejecting drives...");

    const result = await executeCliCommand("npm", ["run", "eject"]);

    operationStatus = "idle";
    currentOperation = null;
    broadcastStatusUpdate("idle", null);

    if (result.success) {
      res.json({ success: true, message: "Drives ejected successfully" });
    } else {
      res
        .status(500)
        .json({ error: "Failed to eject drives: " + result.error });
    }
  } catch (error) {
    operationStatus = "idle";
    currentOperation = null;
    broadcastStatusUpdate("idle", null);
    Logger.error("Failed to eject drives", error.message);
    res.status(500).json({ error: "Failed to eject drives: " + error.message });
  }
});

/**
 * Get current configuration
 */
router.get("/config", async (req, res) => {
  try {
    const configPath = path.join(process.cwd(), "config.yaml");
    const configContent = await fs.readFile(configPath, "utf8");
    res.json({ config: configContent });
  } catch (error) {
    Logger.error("Failed to read config", error.message);
    res.status(500).json({ error: "Failed to read configuration file" });
  }
});

/**
 * Update configuration
 */
router.post("/config", async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res
        .status(400)
        .json({ error: "Configuration content is required" });
    }

    const configPath = path.join(process.cwd(), "config.yaml");
    await fs.writeFile(configPath, config, "utf8");

    res.json({ success: true, message: "Configuration updated successfully" });
  } catch (error) {
    Logger.error("Failed to update config", error.message);
    res
      .status(500)
      .json({ error: "Failed to update configuration: " + error.message });
  }
});

/**
 * Restart the application to reload config
 */
router.post("/restart", async (req, res) => {
  try {
    res.json({ success: true, message: "Application restart initiated" });

    // Give the response time to send before restarting
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (error) {
    Logger.error("Failed to restart application", error.message);
    res.status(500).json({ error: "Failed to restart application" });
  }
});

/**
 * Start the main ripping process using CLI command
 */
router.post("/rip/start", async (req, res) => {
  try {
    if (operationStatus !== "idle") {
      return res
        .status(409)
        .json({ error: "Another operation is in progress" });
    }

    operationStatus = "ripping";
    currentOperation = "Starting rip process...";
    broadcastStatusUpdate("ripping", "Starting rip process...");

    // Start the ripping process in the background using CLI
    setImmediate(async () => {
      try {
        const result = await executeCliCommand("npm", ["run", "start"]);

        operationStatus = "idle";
        currentOperation = null;
        broadcastStatusUpdate("idle", null);

        if (result.success) {
          broadcastLogMessage(
            "success",
            "Ripping process completed successfully"
          );
        } else {
          broadcastLogMessage(
            "error",
            `Ripping process failed: ${result.error}`
          );
        }
      } catch (error) {
        Logger.error("Ripping process failed", error.message);
        operationStatus = "idle";
        currentOperation = null;
        broadcastStatusUpdate("idle", null);
        broadcastLogMessage(
          "error",
          `Ripping process failed: ${error.message}`
        );
      }
    });

    res.json({ success: true, message: "Ripping process started" });
  } catch (error) {
    operationStatus = "idle";
    currentOperation = null;
    Logger.error("Failed to start ripping", error.message);
    res
      .status(500)
      .json({ error: "Failed to start ripping: " + error.message });
  }
});

export { router as apiRoutes };
