import config from "config";

/**
 * Configuration management utility
 */
export class AppConfig {
  static get mkvDir() {
    return config.get("Path.mkvDir.Dir");
  }

  static get movieRipsDir() {
    return config.get("Path.movieRips.Dir");
  }

  static get isFileLogEnabled() {
    return config.get("Path.logToFiles.Enabled").toLowerCase() === "true";
  }

  static get logDir() {
    return config.get("Path.logToFiles.Dir");
  }

  static get logTimeFormat() {
    const format = config.get("Path.logToFiles.timeFormat").toLowerCase();
    return format === "12hr" ? "12hr" : "24hr"; // Default to 24hr if not 12hr
  }

  static get isLoadDrivesEnabled() {
    return config.get("Path.loadDrives.Enabled").toLowerCase() === "true";
  }

  static get isEjectDrivesEnabled() {
    return config.get("Path.ejectDrives.Enabled").toLowerCase() === "true";
  }

  // Legacy support for old ejectDVDs config - for backwards compatibility
  static get isEjectEnabled() {
    return this.isEjectDrivesEnabled;
  }

  // Legacy support for loading drives
  static get isLoadEnabled() {
    return this.isLoadDrivesEnabled;
  }

  static get isRipAllEnabled() {
    return config.get("Path.ripAll.Enabled").toLowerCase() === "true";
  }

  static get rippingMode() {
    const mode = config.get("Path.rippingMode.Mode").toLowerCase();
    return mode === "sync" ? "sync" : "async"; // Default to async if not sync
  }

  static get makeMKVExecutable() {
    return `"${this.mkvDir}\\makemkvcon.exe"`;
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
        `Missing required configuration paths. Please check your default.json file.`
      );
    }
  }
}
