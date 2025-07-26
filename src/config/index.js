import { readFileSync } from "fs";
import { dirname, join, resolve, normalize, sep } from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration management utility
 */
export class AppConfig {
  static #config = null;

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

  static get mkvDir() {
    const config = this.#loadConfig();
    return this.#normalizePath(config.paths?.makemkv_dir);
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

  static get makeMKVExecutable() {
    const mkvDir = this.mkvDir;
    if (!mkvDir) return null;

    // Handle cross-platform executable names
    const executableName =
      process.platform === "win32" ? "makemkvcon.exe" : "makemkvcon";
    const executablePath = join(mkvDir, executableName);

    // Quote the path if it contains spaces (important for Windows paths)
    return executablePath.includes(" ")
      ? `"${executablePath}"`
      : executablePath;
  }

  /**
   * Validate that all required configuration values are present
   */
  static validate() {
    const requiredPaths = [this.mkvDir, this.movieRipsDir, this.logDir];

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
