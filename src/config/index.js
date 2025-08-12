import { readFileSync } from "fs";
import { dirname, join, resolve, normalize, sep } from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";
import { FileSystemUtils } from "../utils/filesystem.js";
import { Logger } from "../utils/logger.js";

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration management utility
 */
export class AppConfig {
  static #config = null;
  static #detectedMkvPath = null;

  constructor() {
    throw new Error("AppConfig is a static class and cannot be instantiated");
  }

  /**
   * Load and parse the YAML configuration file
   */
  static #loadConfig() {
    if (this.#config === null) {
      try {
        const configPath = resolve(__dirname, "../../config.yaml");
        const configContent = readFileSync(configPath, "utf8");
        this.#config = parse(configContent);
      } catch (error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
      }
    }
    return this.#config;
  }

  /**
   * Normalize path for the current operating system
   */
  static #normalizePath(path) {
    if (!path) return path;

    // Convert to the platform-specific path format
    const normalizedPath = normalize(path.replace(/[/\\]/g, sep));

    // Resolve relative paths relative to the project root
    if (normalizedPath.startsWith(".")) {
      const projectRoot = resolve(__dirname, "../..");
      return resolve(projectRoot, normalizedPath);
    }

    return normalizedPath;
  }

  /**
   * Get MakeMKV directory with automatic detection fallback
   * @returns {Promise<string|null>} - MakeMKV directory path
   */
  static async getMkvDir() {
    const config = this.#loadConfig();
    const configuredPath = config.paths?.makemkv_dir;

    // If user has configured a path, use it (with validation)
    if (configuredPath) {
      const normalizedPath = this.#normalizePath(configuredPath);
      const isValid = await FileSystemUtils.validateMakeMKVInstallation(
        normalizedPath
      );

      if (isValid) {
        return normalizedPath;
      } else {
        Logger.warning(`Configured MakeMKV path is invalid: ${normalizedPath}`);
        Logger.info("Falling back to automatic detection...");
      }
    }

    // Fall back to automatic detection
    if (this.#detectedMkvPath === null) {
      this.#detectedMkvPath = await FileSystemUtils.detectMakeMKVInstallation();
    }

    return this.#detectedMkvPath;
  }

  static get movieRipsDir() {
    const config = this.#loadConfig();
    return this.#normalizePath(config.paths?.movie_rips_dir);
  }

  static get isFileLogEnabled() {
    const config = this.#loadConfig();
    return Boolean(config.paths?.logging?.enabled);
  }

  static get logDir() {
    const config = this.#loadConfig();
    return this.#normalizePath(config.paths?.logging?.dir);
  }

  static get logTimeFormat() {
    const config = this.#loadConfig();
    const format = config.paths?.logging?.time_format;
    return format === "24hr" ? "24hr" : "12hr";
  }

  static get isLoadDrivesEnabled() {
    const config = this.#loadConfig();
    return Boolean(config.drives?.auto_load);
  }

  static get isEjectDrivesEnabled() {
    const config = this.#loadConfig();
    return Boolean(config.drives?.auto_eject);
  }

  static get isRipAllEnabled() {
    const config = this.#loadConfig();
    return Boolean(config.ripping?.rip_all_titles);
  }

  static get rippingMode() {
    const config = this.#loadConfig();
    const mode = config.ripping?.mode;
    return mode === "sync" ? "sync" : "async";
  }

  static get mountWaitTimeout() {
    const config = this.#loadConfig();
    const timeout = config.mount_detection?.wait_timeout;
    return typeof timeout === "number" && timeout >= 0 ? timeout : 10;
  }

  static get mountPollInterval() {
    const config = this.#loadConfig();
    const interval = config.mount_detection?.poll_interval;
    return typeof interval === "number" && interval > 0 ? interval : 1;
  }

  static get driveLoadDelay() {
    const config = this.#loadConfig();
    const delay = config.drives?.load_delay;
    return typeof delay === "number" && delay >= 0 ? delay : 0;
  }

  static get isRepeatModeEnabled() {
    const config = this.#loadConfig();
    return Boolean(config.interface?.repeat_mode);
  }

  /**
   * Get the fake date for MakeMKV operations
   * @returns {string|null} - Fake date string or null if not set
   */
  static get makeMKVFakeDate() {
    const config = this.#loadConfig();
    const fakeDate = config.makemkv?.fake_date;
    return fakeDate && fakeDate.trim() !== "" ? fakeDate.trim() : null;
  }

  /**
   * Get MakeMKV executable path with automatic detection
   * @returns {Promise<string|null>} - Full path to makemkvcon executable
   */
  static async getMakeMKVExecutable() {
    const mkvDir = await this.getMkvDir();
    if (!mkvDir) return null;

    // Handle cross-platform executable names
    const executableName =
      process.platform === "win32" ? "makemkvcon64.exe" : "makemkvcon";
    const executablePath = join(mkvDir, executableName);

    // Quote the path if it contains spaces (important for Windows paths)
    return executablePath.includes(" ")
      ? `"${executablePath}"`
      : executablePath;
  }

  /**
   * Validate that all required configuration values are present
   * This includes automatic MakeMKV detection
   */
  static async validate() {
    // Check MakeMKV installation
    const mkvDir = await this.getMkvDir();
    if (!mkvDir) {
      throw new Error(
        `MakeMKV installation not found. Please ensure MakeMKV is installed or configure the path manually in config.yaml`
      );
    }

    // Check other required paths
    const requiredPaths = [this.movieRipsDir, this.logDir];
    const missingPaths = requiredPaths.filter(
      (path) => !path || path.trim() === ""
    );

    if (missingPaths.length > 0) {
      throw new Error(
        `Missing required configuration paths. Please check your config.yaml file.`
      );
    }
  }
}
