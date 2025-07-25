import os from "os";
import { createRequire } from "module";
import { Logger } from "./logger.js";

/**
 * Native optical drive utilities for Windows using C++ DeviceIoControl API
 * Requires the native C++ addon to be built and available
 */
class NativeOpticalDrive {
  static #nativeAddon = null;

  /**
   * Initialize the native addon (lazy loading)
   */
  static #initNativeAddon() {
    if (this.#nativeAddon === null && os.platform() === "win32") {
      try {
        // Create require function for ES modules
        const require = createRequire(import.meta.url);

        // Try to load the native addon
        this.#nativeAddon = require("../../build/Release/optical_drive_native.node");
        Logger.info("Native optical drive addon loaded successfully");
      } catch (error) {
        Logger.error(`Failed to load native addon: ${error.message}`);
        this.#nativeAddon = false; // Mark as failed to avoid retries
        throw new Error(
          `Native optical drive addon is required but failed to load: ${error.message}`
        );
      }
    }
  }

  /**
   * Check if native addon is available
   */
  static get isNativeAvailable() {
    // Only available on Windows
    if (os.platform() !== "win32") {
      return false;
    }

    this.#initNativeAddon();
    return (
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

    this.#initNativeAddon();

    if (this.isNativeAvailable) {
      try {
        const success = this.#nativeAddon.ejectDrive(driveLetter);
        Logger.info(
          `Native eject drive ${driveLetter}: ${success ? "success" : "failed"}`
        );
        return success;
      } catch (error) {
        Logger.error(
          `Native eject failed for ${driveLetter}: ${error.message}`
        );
        throw error;
      }
    } else {
      throw new Error("Native addon not available");
    }
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

    this.#initNativeAddon();

    if (this.isNativeAvailable) {
      try {
        const success = this.#nativeAddon.loadDrive(driveLetter);
        Logger.info(
          `Native load drive ${driveLetter}: ${success ? "success" : "failed"}`
        );
        return success;
      } catch (error) {
        Logger.error(`Native load failed for ${driveLetter}: ${error.message}`);
        throw error;
      }
    } else {
      throw new Error("Native addon not available");
    }
  }

  /**
   * Eject all optical drives
   * @param {Array} drives - Array of drive objects with 'id' property
   * @returns {Promise<void>}
   */
  static async ejectAllDrives(drives) {
    for (const drive of drives) {
      try {
        await this.ejectDrive(drive.id);
      } catch (error) {
        Logger.error(`Failed to eject drive ${drive.id}: ${error.message}`);
        // Continue with other drives
      }
    }
  }

  /**
   * Load all optical drives
   * @param {Array} drives - Array of drive objects with 'id' property
   * @returns {Promise<void>}
   */
  static async loadAllDrives(drives) {
    for (const drive of drives) {
      try {
        await this.loadDrive(drive.id);
      } catch (error) {
        Logger.error(`Failed to load drive ${drive.id}: ${error.message}`);
        // Continue with other drives
      }
    }
  }
}

export { NativeOpticalDrive };
