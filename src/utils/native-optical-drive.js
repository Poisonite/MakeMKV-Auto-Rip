import os from "os";
import { createRequire } from "module";
import { Logger } from "./logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Native optical drive utilities for Windows using C++ DeviceIoControl API
 * Requires administrator privileges on Windows
 */
class NativeOpticalDrive {
  static #nativeAddon = null;

  /**
   * Check if running as administrator on Windows
   */
  static #isWindowsAdmin() {
    if (os.platform() !== "win32") return true;

    try {
      // Try to run a command that requires admin privileges
      execSync("net session >nul 2>&1", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the native addon (lazy loading)
   */
  static #initNativeAddon() {
    if (this.#nativeAddon === null && os.platform() === "win32") {
      try {
        // Create require function for ES modules
        const require = createRequire(import.meta.url);

        // Check if pre-built addon exists
        const addonPath = path.join(
          __dirname,
          "../../build/Release/optical_drive_native.node"
        );
        if (!fs.existsSync(addonPath)) {
          throw new Error(
            `Pre-built native addon not found at ${addonPath}. This may be a corrupted installation.`
          );
        }

        // Try to load the native addon
        this.#nativeAddon = require("../../build/Release/optical_drive_native.node");
        Logger.info("Native optical drive addon loaded successfully");

        // Warn if not running as admin (only once when loading)
        if (!this.#isWindowsAdmin()) {
          Logger.warning(
            "Not running as administrator - optical drive operations may fail"
          );
          Logger.info("For best results, run terminal as administrator");
        }
      } catch (error) {
        Logger.error(`Failed to load native addon: ${error.message}`);
        this.#nativeAddon = false;
        throw new Error(
          `Native optical drive addon is required but failed to load: ${error.message}`
        );
      }
    }
  }

  /**
   * Whether the native addon is loaded and usable.
   *
   * Never throws: a failed load is reported by #initNativeAddon and answered
   * here as "not available", so callers get the same clean answer on the first
   * attempt as on every later one.
   * @returns {boolean}
   */
  static get isNativeAvailable() {
    if (os.platform() !== "win32") {
      return false;
    }

    try {
      this.#initNativeAddon();
    } catch {
      return false;
    }

    return Boolean(
      this.#nativeAddon && typeof this.#nativeAddon.ejectDrive === "function"
    );
  }

  /**
   * Eject optical drive using native Windows API
   * @param {string} driveLetter - Drive letter (e.g., "D:")
   * @returns {Promise<boolean>} Success status
   */
  static async ejectDrive(driveLetter) {
    if (os.platform() !== "win32") {
      throw new Error("Native drive operations only supported on Windows");
    }

    if (!this.isNativeAvailable) {
      throw new Error("Native addon not available");
    }

    // Ensure proper format: remove any extra colons and normalize
    const normalizedDriveLetter =
      driveLetter.replace(/::+/g, ":").replace(/:$/, "") + ":";

    const success = this.#nativeAddon.ejectDrive(normalizedDriveLetter);
    if (!success) {
      throw new Error(`Eject failed - try running as administrator`);
    }

    return success;
  }

  /**
   * Load/close optical drive using native Windows API
   * @param {string} driveLetter - Drive letter (e.g., "D:")
   * @returns {Promise<boolean>} Success status
   */
  static async loadDrive(driveLetter) {
    if (os.platform() !== "win32") {
      throw new Error("Native drive operations only supported on Windows");
    }

    if (!this.isNativeAvailable) {
      throw new Error("Native addon not available");
    }

    // Ensure proper format: remove any extra colons and normalize
    const normalizedDriveLetter =
      driveLetter.replace(/::+/g, ":").replace(/:$/, "") + ":";

    const success = this.#nativeAddon.loadDrive(normalizedDriveLetter);
    if (!success) {
      throw new Error(`Load failed - try running as administrator`);
    }

    return success;
  }
}

export { NativeOpticalDrive };
