/**
 * MakeMKV Auto Rip - Web API Routes
 * Handles all API endpoints for the web interface
 */

import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { isScalar, parse as yamlParse, parseDocument } from "yaml";
import { AppConfig } from "../../config/index.js";
import { prepareRipRuntime } from "../../app.js";
import { DiscService } from "../../services/disc.service.js";
import { DriveService } from "../../services/drive.service.js";
import { RipService } from "../../services/rip.service.js";
import { EncodeQueue } from "../../services/encode-queue.js";
import { FileSystemUtils } from "../../utils/filesystem.js";
import { Logger } from "../../utils/logger.js";
import {
  broadcastStatusUpdate,
  broadcastLogMessage,
} from "../middleware/websocket.middleware.js";

const router = Router();

// Status tracking
let currentOperation = null;
let operationStatus = "idle"; // idle, loading, ejecting, ripping
let currentOperationPromise = null;
let activeWebLoggerSinkCleanup = null;
// One RipService per rip-mode session.
let ripSession = null;
// One HandBrake queue for the life of the server. It is shared by every rip
// session, so stopping rip mode, saving the config or swapping discs never
// throws away an encode; leftovers from a previous run are queued at startup.
const encodeQueue = EncodeQueue.detached();
let ripModeEnabled = false;
let ripModeLoop = null;

function getCanStop() {
  return currentOperationPromise !== null || (operationStatus === "ripping" && ripModeEnabled);
}

function broadcastCurrentStatus() {
  broadcastStatusUpdate(operationStatus, currentOperation, {
    canStop: getCanStop(),
  });
}

function setOperationState(status, operation = null) {
  operationStatus = status;
  currentOperation = operation;
  broadcastCurrentStatus();
}

function resetOperationState() {
  operationStatus = "idle";
  currentOperation = null;
  currentOperationPromise = null;
  broadcastCurrentStatus();
}

function formatLogMessage(message, title = null) {
  return [message, title]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => String(value))
    .join(" ")
    .trim();
}

function attachWebLoggerSink() {
  if (activeWebLoggerSinkCleanup) {
    return activeWebLoggerSinkCleanup;
  }

  activeWebLoggerSinkCleanup = Logger.addSink(
    ({ level, message, title, details }) => {
      if (level === "debug") {
        return;
      }

      const formattedMessage = formatLogMessage(message, title);
      if (formattedMessage) {
        broadcastLogMessage(level, formattedMessage);
      }

      if (details !== null && details !== undefined && details !== "") {
        broadcastLogMessage(level, String(details));
      }
    }
  );

  return activeWebLoggerSinkCleanup;
}

function detachWebLoggerSink() {
  if (activeWebLoggerSinkCleanup) {
    activeWebLoggerSinkCleanup();
    activeWebLoggerSinkCleanup = null;
  }
}

async function runTrackedOperation(operation) {
  currentOperationPromise = Promise.resolve().then(operation);
  broadcastCurrentStatus();

  try {
    return await currentOperationPromise;
  } finally {
    currentOperationPromise = null;
    broadcastCurrentStatus();
  }
}

function ensureRipSession() {
  if (!ripSession) {
    ripSession = new RipService({
      exitOnCriticalError: false,
      // Encode in the background: the disc is ejected as soon as it is ripped,
      // so waiting for HandBrake here would leave the drive idle (and the loop
      // blind to disc changes) for the length of an encode.
      backgroundHandBrake: true,
      encodeQueue,
    });
  }

  return ripSession;
}

async function executeRipCycle() {
  const ripService = ensureRipSession();

  try {
    await prepareRipRuntime();
    await runTrackedOperation(() => ripService.startRipping());

    if (ripService.wasCancelled()) {
      return { success: false, cancelled: true };
    }

    return { success: true };
  } catch (error) {
    if (ripService.isCancellationRequested() || ripService.isCancellationError(error)) {
      return { success: false, cancelled: true };
    }

    Logger.error("Rip cycle failed", error.message);
    return { success: false, error: error.message };
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRipPollIntervalMs() {
  return Math.max(AppConfig.mountPollInterval * 1000, 1000);
}

/**
 * Stable identity of a detected disc: the drive holding it plus its volume
 * label. Used to tell "the disc I just ripped is still sitting there" apart
 * from "a new disc has been loaded".
 */
function discKey(disc) {
  return `${disc.driveNumber}:${disc.title}`;
}

function describeDiscs(discs) {
  return discs.map((disc) => disc.title).join(", ");
}

/**
 * Poll the drives once.
 * @returns {Promise<Array|null>} Detected discs, or null when the detection
 *   itself failed - which must not be read as "the drives are empty", or a
 *   single hiccup would make the loop re-rip the disc that is still loaded.
 */
async function detectDiscsForRipMode() {
  try {
    return await DiscService.detectAvailableDiscs();
  } catch (error) {
    Logger.error("Rip mode disc detection failed", error.message);
    return null;
  }
}

function describeBackgroundEncoding() {
  const status = encodeQueue.status();
  if (!status?.total) {
    return "";
  }

  return ` (encoding ${status.active ?? "queued files"}${
    status.pending ? ` +${status.pending} queued` : ""
  } in the background)`;
}

/**
 * Wait until a disc is loaded that we have not just ripped.
 *
 * A disc counts as new when either the drives have been seen empty since the
 * last rip (the normal eject then swap), or its identity differs from what we
 * ripped last (a swap made while we were busy ripping and not polling). Both
 * rules are needed: waiting for "empty" alone hangs forever when the user
 * swaps discs during a rip, and comparing identity alone would ignore a
 * genuinely new disc that happens to share a volume label.
 *
 * @param {Set<string>} rippedKeys - Identities from the previous cycle. Cleared
 *   in place once the drives are observed empty.
 * @returns {Promise<Array>} Discs present when one of them is new; empty when
 *   rip mode was stopped.
 */
async function waitForNextDiscs(rippedKeys) {
  let lastAnnounced = null;

  const announce = (message) => {
    if (message !== lastAnnounced) {
      lastAnnounced = message;
      broadcastLogMessage("info", message);
    }

    setOperationState("ripping", `${message}${describeBackgroundEncoding()}`);
  };

  while (ripModeEnabled) {
    const detectedDiscs = await detectDiscsForRipMode();

    if (!ripModeEnabled) {
      break;
    }

    if (detectedDiscs === null) {
      announce("Disc detection failed. Retrying...");
    } else if (detectedDiscs.length === 0) {
      // Drives are empty, so whatever is loaded next is a new disc.
      rippedKeys.clear();
      announce("Waiting for disc insertion...");
    } else if (detectedDiscs.some((disc) => !rippedKeys.has(discKey(disc)))) {
      return detectedDiscs;
    } else {
      announce(
        `${describeDiscs(detectedDiscs)} was already ripped. Waiting for the disc to be removed or swapped...`
      );
    }

    await wait(getRipPollIntervalMs());
  }

  return [];
}

async function runRipModeLoop() {
  // Identities of the discs ripped by the previous cycle.
  const rippedKeys = new Set();

  broadcastLogMessage(
    "info",
    "Rip mode enabled. Waiting for inserted discs..."
  );

  while (ripModeEnabled) {
    const detectedDiscs = await waitForNextDiscs(rippedKeys);

    if (!ripModeEnabled || detectedDiscs.length === 0) {
      break;
    }

    setOperationState(
      "ripping",
      `Detected ${detectedDiscs.length} disc(s): ${describeDiscs(detectedDiscs)}. Starting rip process...`
    );

    // Record the discs before ripping: they are ejected partway through the
    // cycle, so this is the last point at which they can be identified.
    rippedKeys.clear();
    for (const disc of detectedDiscs) {
      rippedKeys.add(discKey(disc));
    }

    const result = await executeRipCycle();

    if (!ripModeEnabled) {
      break;
    }

    if (result.success) {
      broadcastLogMessage(
        "success",
        "Rip cycle completed successfully. Insert the next disc and close the drive to keep ripping."
      );
    } else {
      broadcastLogMessage(
        "error",
        `Rip cycle failed${result.error ? `: ${result.error}` : ""}`
      );
    }
  }
}

function ensureRipModeLoop() {
  if (ripModeLoop) {
    return ripModeLoop;
  }

  ripModeLoop = (async () => {
    attachWebLoggerSink();

    try {
      await runRipModeLoop();
    } catch (error) {
      Logger.error("Rip mode loop failed", error.message);
      broadcastLogMessage("error", `Rip mode failed: ${error.message}`);
    } finally {
      ripModeLoop = null;

      // The encode queue belongs to the server, not the session, so it keeps
      // working after rip mode stops.
      const finishedSession = ripSession;
      ripSession = null;
      finishedSession?.requestCancel();

      detachWebLoggerSink();

      if (!ripModeEnabled) {
        resetOperationState();
      }
    }
  })();

  return ripModeLoop;
}

function stopCurrentOperation(message) {
  ripModeEnabled = false;

  // Cancels the in-flight rip. Safe to call while the loop is only waiting for
  // a disc: it just marks the session cancelled. Encoding carries on.
  const encoding = encodeQueue.status();
  ripSession?.requestCancel();

  if (currentOperationPromise) {
    setOperationState(operationStatus, "Cancelling current operation...");
  } else {
    detachWebLoggerSink();
    resetOperationState();
  }

  broadcastLogMessage("warn", message);

  if (encoding?.total) {
    broadcastLogMessage(
      "warn",
      `HandBrake keeps encoding ${encoding.total} in-progress/queued file(s) in the background.`
    );
  }
}

/**
 * Get current system status
 */
router.get("/status", async (req, res) => {
  try {
    res.json({
      operation: currentOperation,
      status: operationStatus,
      canStop: getCanStop(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Logger.error("Failed to get status", error.message);
    res.status(500).json({ error: "Failed to get status" });
  }
});

/**
 * Get application info (name, version)
 */
router.get("/info", async (req, res) => {
  try {
    const packagePath = path.join(process.cwd(), "package.json");
    const packageContent = await fs.readFile(packagePath, "utf8");
    const pkg = JSON.parse(packageContent);
    res.json({ name: pkg.name, version: pkg.version });
  } catch (error) {
    Logger.error("Failed to read package.json for app info", error.message);
    res.status(500).json({ error: "Failed to get application info" });
  }
});

/**
 * Stop current operation
 */
router.post("/stop", async (req, res) => {
  try {
    if (getCanStop()) {
      stopCurrentOperation("Operation stopped by user");
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
 * Load all drives using the same in-process service path as the CLI
 */
router.post("/drives/load", async (req, res) => {
  try {
    if (operationStatus !== "idle") {
      return res
        .status(409)
        .json({ error: "Another operation is in progress" });
    }

    setOperationState("loading", "Loading drives...");
    attachWebLoggerSink();

    await AppConfig.validate();
    await runTrackedOperation(() => DriveService.loadDrivesWithWait());

    resetOperationState();
    detachWebLoggerSink();

    {
      res.json({ success: true, message: "Drives loaded successfully" });
    }
  } catch (error) {
    resetOperationState();
    detachWebLoggerSink();
    Logger.error("Failed to load drives", error.message);
    res.status(500).json({ error: "Failed to load drives: " + error.message });
  }
});

/**
 * Eject all drives using the same in-process service path as the CLI
 */
router.post("/drives/eject", async (req, res) => {
  try {
    if (operationStatus !== "idle") {
      return res
        .status(409)
        .json({ error: "Another operation is in progress" });
    }

    setOperationState("ejecting", "Ejecting drives...");
    attachWebLoggerSink();

    await AppConfig.validate();
    await runTrackedOperation(() => DriveService.ejectAllDrives());

    resetOperationState();
    detachWebLoggerSink();

    {
      res.json({ success: true, message: "Drives ejected successfully" });
    }
  } catch (error) {
    resetOperationState();
    detachWebLoggerSink();
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
    const wasRunning = operationStatus !== "idle";

    // If not idle, kill the current process before saving config
    if (wasRunning) {
      Logger.info("Stopping current operation to save configuration...");

      try {
        stopCurrentOperation("Operation stopped to save configuration");
      } catch (killError) {
        Logger.error("Failed to stop current process", killError.message);
        // Continue with config save even if kill failed
      }
    }

    const configPath = path.join(process.cwd(), "config.yaml");

    // Read existing YAML content
    const existingContent = await fs.readFile(configPath, "utf8");

    // Update only specific values while preserving all comments and structure
    const updatedContent = applyConfigToYaml(existingContent, config);

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
 * Write a nested config object into the YAML source, preserving comments,
 * key order and formatting.
 *
 * Values are set by full key path. A previous version matched keys by name
 * with a regex, which wrote to whichever line in the file happened to use that
 * name first - saving `handbrake.enabled` landed on `paths.logging.enabled`.
 * @param {string} yamlContent - Current config.yaml contents
 * @param {Object} config - Nested configuration object from the web UI
 * @returns {string} Updated YAML
 */
function applyConfigToYaml(yamlContent, config) {
  const doc = parseDocument(yamlContent);

  for (const [keyPath, value] of flattenConfig(config)) {
    setYamlValue(doc, keyPath, value);
  }

  // makemkv_dir is optional: the UI omits it when the path override is off.
  if (config.paths && !Object.hasOwn(config.paths, "makemkv_dir")) {
    doc.deleteIn(["paths", "makemkv_dir"]);
  }

  return String(doc);
}

/**
 * Walk a nested config object, yielding [keyPath, scalarValue] pairs.
 * @param {Object} value
 * @param {string[]} [keyPath]
 * @returns {Generator<[string[], *]>}
 */
function* flattenConfig(value, keyPath = []) {
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...keyPath, key];

    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      yield* flattenConfig(child, childPath);
    } else if (child !== undefined) {
      yield [childPath, child];
    }
  }
}

/**
 * Set one value in a YAML document. Writing through an existing scalar node
 * keeps its style, so a quoted path stays quoted instead of churning the file
 * on every save; a type change (or a new key) falls back to a plain set.
 */
function setYamlValue(doc, keyPath, value) {
  const existing = doc.getIn(keyPath, true);

  if (isScalar(existing) && typeof existing.value === typeof value) {
    existing.value = value;
    return;
  }

  doc.setIn(keyPath, value);
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

    // The status goes idle the moment a stop is requested, but the loop needs a
    // poll interval to unwind. Starting again before then would hand the new
    // session to the old loop as it shuts down.
    if (ripModeLoop) {
      return res
        .status(409)
        .json({ error: "Rip mode is still stopping, please try again" });
    }

    ripModeEnabled = true;
    setOperationState("ripping", "Starting rip mode...");

    // Keep rip mode running in the background until the user stops it.
    void ensureRipModeLoop();

    res.json({ success: true, message: "Rip mode enabled" });
  } catch (error) {
    ripModeEnabled = false;
    resetOperationState();
    Logger.error("Failed to start ripping", error.message);
    res
      .status(500)
      .json({ error: "Failed to start ripping: " + error.message });
  }
});

/**
 * Queue every MKV left in the rips folder that was never converted - because
 * the server stopped mid-encode, or the encode failed - so a restart finishes
 * the job.
 * @returns {number} How many files were found
 */
function queueUnconvertedFiles() {
  if (!AppConfig.isHandBrakeEnabled) {
    return 0;
  }

  const { delete_original, output_format } = AppConfig.handbrake;
  const files = FileSystemUtils.findUnconvertedMkvFiles(AppConfig.movieRipsDir, {
    skipIfConvertedTo: delete_original ? null : output_format.toLowerCase(),
  });
  if (files.length === 0) {
    Logger.info("No unconverted MKV files found.");
    return 0;
  }

  Logger.info(`Found ${files.length} unconverted MKV file(s); queueing them for HandBrake.`);

  const byFolder = new Map();
  for (const file of files) {
    const folder = path.dirname(file);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), path.basename(file)]);
  }

  for (const [folder, names] of byFolder) {
    encodeQueue.add(names, folder, "unconverted MKV file");
  }

  return files.length;
}

export { router as apiRoutes, applyConfigToYaml, queueUnconvertedFiles };
