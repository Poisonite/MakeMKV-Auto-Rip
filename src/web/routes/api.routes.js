/**
 * MakeMKV Auto Rip - Web API Routes
 * Handles all API endpoints for the web interface
 */

import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import { Logger } from "../../utils/logger.js";
import {
  broadcastStatusUpdate,
  broadcastLogMessage,
} from "../middleware/websocket.middleware.js";

const router = Router();

// Status tracking
let currentOperation = null;
let operationStatus = "idle"; // idle, loading, ejecting, ripping
let currentProcess = null; // Store reference to current running process

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

    // Store reference to current process for potential termination
    currentProcess = childProcess;

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
      currentProcess = null; // Clear the process reference
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim(),
      });
    });

    childProcess.on("error", (err) => {
      currentProcess = null; // Clear the process reference
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
      canStop: currentProcess !== null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Logger.error("Failed to get status", error.message);
    res.status(500).json({ error: "Failed to get status" });
  }
});

/**
 * Stop current operation
 */
router.post("/stop", async (req, res) => {
  try {
    if (currentProcess) {
      currentProcess.kill("SIGTERM");

      // Wait a moment, then force kill if still running
      setTimeout(() => {
        if (currentProcess && !currentProcess.killed) {
          currentProcess.kill("SIGKILL");
        }
      }, 3000);

      operationStatus = "idle";
      currentOperation = null;
      currentProcess = null;

      broadcastStatusUpdate("idle", null);
      broadcastLogMessage("warn", "Operation stopped by user");

      res.json({ success: true, message: "Operation stopped" });
    } else {
      res.status(400).json({ error: "No operation is currently running" });
    }
  } catch (error) {
    Logger.error("Failed to stop operation", error.message);
    res
      .status(500)
      .json({ error: "Failed to stop operation: " + error.message });
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

    const result = await executeCliCommand("npm", [
      "run",
      "load",
      "--silent",
      "--",
      "--quiet",
    ]);

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

    const result = await executeCliCommand("npm", [
      "run",
      "eject",
      "--silent",
      "--",
      "--quiet",
    ]);

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
 * Get current configuration as structured object
 */
router.get("/config/structured", async (req, res) => {
  try {
    const configPath = path.join(process.cwd(), "config.yaml");
    const configContent = await fs.readFile(configPath, "utf8");
    const config = yamlParse(configContent);
    res.json({ config });
  } catch (error) {
    Logger.error("Failed to read structured config", error.message);
    res.status(500).json({ error: "Failed to read configuration file" });
  }
});

/**
 * Update configuration with structured object
 */
router.post("/config/structured", async (req, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== "object") {
      return res
        .status(400)
        .json({ error: "Configuration object is required" });
    }

    // Validate required fields
    if (!config.paths?.movie_rips_dir) {
      return res
        .status(400)
        .json({ error: "Movie rips directory is required" });
    }

    if (config.paths?.logging?.enabled && !config.paths?.logging?.dir) {
      return res
        .status(400)
        .json({ error: "Log directory is required when logging is enabled" });
    }

    // Track if we need to kill a process
    const wasRunning = operationStatus !== "idle" && currentProcess;

    // If not idle, kill the current process before saving config
    if (wasRunning) {
      Logger.info("Stopping current operation to save configuration...");

      // Kill the current process
      try {
        currentProcess.kill("SIGTERM");

        // Give it a moment to terminate gracefully, then force kill if needed
        setTimeout(() => {
          if (currentProcess && !currentProcess.killed) {
            currentProcess.kill("SIGKILL");
          }
        }, 3000);

        // Reset state
        operationStatus = "idle";
        currentOperation = null;
        currentProcess = null;

        // Broadcast status update
        broadcastStatusUpdate("idle", null);
      } catch (killError) {
        Logger.error("Failed to stop current process", killError.message);
        // Continue with config save even if kill failed
      }
    }

    const configPath = path.join(process.cwd(), "config.yaml");

    // Read existing YAML content
    const existingContent = await fs.readFile(configPath, "utf8");

    // Update only specific values while preserving all comments and structure
    const updatedContent = updateYamlValues(existingContent, config);

    await fs.writeFile(configPath, updatedContent, "utf8");

    Logger.info("Configuration updated successfully");
    res.json({
      success: true,
      message: "Configuration updated successfully",
      processKilled: wasRunning, // Let frontend know if we killed a process
    });
  } catch (error) {
    Logger.error("Failed to update structured config", error.message);
    res
      .status(500)
      .json({ error: "Failed to update configuration: " + error.message });
  }
});

/**
 * Update YAML values while preserving all comments and formatting
 */
function updateYamlValues(yamlContent, config) {
  let updatedContent = yamlContent;

  // Helper function to properly format YAML values
  function formatYamlValue(value) {
    if (typeof value === "string") {
      // Always quote strings
      return `"${value}"`;
    } else if (typeof value === "boolean") {
      return value.toString();
    } else if (typeof value === "number") {
      return value.toString();
    }
    return value;
  }

  // Helper function to update a specific key-value pair
  function updateKeyValue(content, keyPath, value) {
    const keys = keyPath.split(".");
    let currentContent = content;

    if (keys.length === 1) {
      // Top-level key (e.g., "interface:")
      const regex = new RegExp(`^(\\s*${keys[0]}\\s*:)\\s*(.*)$`, "m");
      const match = currentContent.match(regex);
      if (match) {
        currentContent = currentContent.replace(
          regex,
          `$1 ${formatYamlValue(value)}`
        );
      }
    } else {
      // Nested key (e.g., "paths.movie_rips_dir")
      const parentKey = keys[0];
      const childKey = keys[keys.length - 1];

      // Find the parent section
      const parentRegex = new RegExp(`^(\\s*${parentKey}\\s*:)`, "m");
      const parentMatch = currentContent.match(parentRegex);

      if (parentMatch) {
        // First try to find an active (uncommented) child key
        const childRegex = new RegExp(`^(\\s+${childKey}\\s*:)\\s*(.*)$`, "m");
        const childMatch = currentContent.match(childRegex);

        if (childMatch) {
          // Found active key, update it
          currentContent = currentContent.replace(
            childRegex,
            `$1 ${formatYamlValue(value)}`
          );
        } else {
          // Look for commented version of the key to uncomment and update
          const commentedRegex = new RegExp(
            `^(\\s*)#\\s*(${childKey}\\s*:)\\s*(.*)$`,
            "m"
          );
          const commentedMatch = currentContent.match(commentedRegex);

          if (commentedMatch) {
            // Uncomment and update the value
            currentContent = currentContent.replace(
              commentedRegex,
              `$1$2 ${formatYamlValue(value)}`
            );
          } else {
            // Key doesn't exist, add it after the parent section header
            const parentIndex = currentContent.search(parentRegex);
            if (parentIndex !== -1) {
              const lines = currentContent.split("\n");
              let insertIndex = -1;

              // Find the line with the parent key
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(parentRegex)) {
                  insertIndex = i + 1;
                  break;
                }
              }

              if (insertIndex !== -1) {
                // Insert the new key after the parent
                const indent = "  "; // Use 2 spaces for indentation
                const newLine = `${indent}${childKey}: ${formatYamlValue(
                  value
                )}`;
                lines.splice(insertIndex, 0, newLine);
                currentContent = lines.join("\n");
              }
            }
          }
        }
      }
    }

    return currentContent;
  }

  // Function to handle deletion of optional keys
  function deleteKeyValue(content, keyPath) {
    const keys = keyPath.split(".");

    if (keys.length === 1) {
      // Top-level key deletion
      const regex = new RegExp(`^\\s*${keys[0]}\\s*:.*$`, "m");
      return content.replace(regex, "");
    } else {
      // Nested key deletion
      const childKey = keys[keys.length - 1];
      const regex = new RegExp(`^\\s+${childKey}\\s*:.*$`, "m");
      return content.replace(regex, "");
    }
  }

  // Recursively process the config object
  function processConfigObject(obj, prefix = "") {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        // Recursively process nested objects
        processConfigObject(value, fullKey);
      } else if (value !== undefined) {
        // Update the value
        updatedContent = updateKeyValue(updatedContent, fullKey, value);
      }
    }
  }

  // Handle makemkv_dir deletion if it was removed from config
  if (config.paths && !config.paths.hasOwnProperty("makemkv_dir")) {
    // Comment out the makemkv_dir line if it exists and is not already commented
    const makemkvRegex = /^(\s+)(makemkv_dir\s*:.*$)/m;
    const match = updatedContent.match(makemkvRegex);
    if (match) {
      updatedContent = updatedContent.replace(makemkvRegex, "$1# $2");
    }
  }

  // Process all the config updates
  processConfigObject(config);

  return updatedContent;
}

/**
 * Deep merge utility function for configuration objects
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
}

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
        const result = await executeCliCommand("npm", [
          "run",
          "start",
          "--silent",
          "--",
          "--no-confirm",
          "--quiet",
        ]);

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
