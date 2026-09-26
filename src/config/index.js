import { readFileSync } from "fs";
import fs from "fs";
import { dirname, join, resolve, normalize, sep } from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";
import { FileSystemUtils } from "../utils/filesystem.js";
import { Logger } from "../utils/logger.js";
import { validateHandBrakeConfig } from "../utils/handbrake-config.js";

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

  /**
   * Whether ddrescue-based read-error recovery is enabled for damaged discs
   * @returns {boolean}
   */
  static get isReadErrorRecoveryEnabled() {
    const config = this.#loadConfig();
    return Boolean(config.ripping?.recover_read_errors);
  }

  /**
   * Settings for the ddrescue/MSYS2 read-error recovery flow
   * @returns {{msys2Dir: string, devicePrefix: string, devicePath: string, workDir: string, keepImage: boolean, passes: number, retries: number, timeout: string, maxRuntime: string, maxRuntimeRatio: number, minRuntime: string, reversePass: boolean, direct: boolean, resume: boolean, imageRetentionDays: number, minFreeGb: number}}
   */
  static get readErrorRecovery() {
    const config = this.#loadConfig();
    const recovery = config.ripping?.recovery || {};
    const trimmedString = (value, fallback) =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
    const nonNegInt = (value, fallback) =>
      Number.isInteger(value) && value >= 0 ? value : fallback;
    const nonNegNum = (value, fallback) =>
      typeof value === "number" && value >= 0 ? value : fallback;

    return {
      msys2Dir: trimmedString(recovery.msys2_dir, "C:/msys64"),
      devicePrefix: trimmedString(recovery.device_prefix, "/dev/sr"),
      devicePath: trimmedString(recovery.device_path, ""),
      workDir: trimmedString(recovery.work_dir, ""),
      keepImage: Boolean(recovery.keep_image),
      passes: nonNegInt(recovery.passes, 1) || 1,
      retries: nonNegInt(recovery.retries, 3),
      timeout: trimmedString(recovery.timeout, ""),
      maxRuntime: trimmedString(recovery.max_runtime, ""),
      maxRuntimeRatio: nonNegNum(recovery.max_runtime_ratio, 1),
      minRuntime: trimmedString(recovery.min_runtime, "10m"),
      reversePass: recovery.reverse_pass !== undefined
        ? Boolean(recovery.reverse_pass)
        : true,
      direct: Boolean(recovery.direct),
      resume: recovery.resume !== undefined ? Boolean(recovery.resume) : true,
      imageRetentionDays: nonNegInt(recovery.image_retention_days, 7),
      minFreeGb: nonNegNum(recovery.min_free_gb, 10),
    };
  }

  /**
   * MakeMKV read-cache size in MB (makemkvcon --cache). 0 leaves MakeMKV's own
   * default in place.
   * @returns {number}
   */
  static get readCacheMb() {
    const config = this.#loadConfig();
    const cache = config.ripping?.read_cache_mb;
    return Number.isFinite(cache) && cache > 0 ? Math.floor(cache) : 0;
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
  /**
   * Get HandBrake configuration object
   * @returns {Object} HandBrake configuration
   */
  static get handbrake() {
    const config = this.#loadConfig();
    if (!config.handbrake) {
      return {
        enabled: false,
        cli_path: null,
        preset: "Fast 1080p30",
        output_format: "mp4",
        delete_original: false,
        cpu_percent: 75,
        additional_args: "",
        subtitles: {
          enabled: true,
          lang_list: "eng,any",
          all: true,
          default: "1",
          burned: "none"
        }
      };
    }

    return {
      enabled: Boolean(config.handbrake.enabled),
      cli_path: config.handbrake.cli_path || null,
      preset: config.handbrake.preset || "Fast 1080p30",
      output_format: (config.handbrake.output_format || "mp4").toLowerCase(),
      delete_original: Boolean(config.handbrake.delete_original),
      cpu_percent: config.handbrake.cpu_percent !== undefined ? config.handbrake.cpu_percent : 75,
      additional_args: config.handbrake.additional_args || "",
      subtitles: {
        enabled: config.handbrake.subtitles?.enabled !== undefined
          ? Boolean(config.handbrake.subtitles.enabled)
          : true,
        lang_list: typeof config.handbrake.subtitles?.lang_list === 'string' && config.handbrake.subtitles.lang_list.trim() !== ''
          ? config.handbrake.subtitles.lang_list.trim()
          : "eng,any",
        all: config.handbrake.subtitles?.all !== undefined
          ? Boolean(config.handbrake.subtitles.all)
          : true,
        default: config.handbrake.subtitles?.default !== undefined
          ? String(config.handbrake.subtitles.default).trim()
          : "1",
        burned: "none"
      }
    };
  }

  /**
   * Check if HandBrake post-processing is enabled
   * @returns {boolean}
   */
  static get isHandBrakeEnabled() {
    return Boolean(this.handbrake.enabled);
  }

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

    // Load and validate HandBrake configuration using centralized validation
    const config = this.#loadConfig();
    Logger.info("Checking HandBrake configuration...");
    if (config.handbrake?.enabled) {
      Logger.info("HandBrake post-processing is enabled");
      const handbrakeConfig = this.handbrake;

      // Use centralized validation from handbrake-config.js
      const validationResult = validateHandBrakeConfig(handbrakeConfig);
      if (!validationResult.isValid) {
        throw new Error(
          `HandBrake configuration error: ${validationResult.errors.join(', ')}`
        );
      }

      // If cli_path is specified, verify the file exists (filesystem check)
      if (handbrakeConfig.cli_path) {
        const cliPath = normalize(handbrakeConfig.cli_path);
        try {
          if (!fs.existsSync(cliPath)) {
            throw new Error(
              `Configured HandBrake CLI path does not exist: ${cliPath}`
            );
          }
        } catch (error) {
          throw new Error(
            `Invalid HandBrake CLI path: ${error.message}`
          );
        }
      }
    }
  }
}
