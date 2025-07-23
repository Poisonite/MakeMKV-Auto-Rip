import config from "config";

/**
 * Configuration management utility
 */
export class AppConfig {
  constructor() {
    throw new Error("AppConfig is a static class and cannot be instantiated");
  }

  static get mkvDir() {
    return config.get("Path.mkvDir.Dir");
  }

  static get movieRipsDir() {
    return config.get("Path.movieRips.Dir");
  }

  static get isFileLogEnabled() {
    const value = config.get("Path.logToFiles.Enabled");
    return value ? value.toLowerCase() === "true" : false;
  }

  static get logDir() {
    return config.get("Path.logToFiles.Dir");
  }

  static get isEjectEnabled() {
    const value = config.get("Path.ejectDVDs.Enabled");
    return value ? value.toLowerCase() === "true" : false;
  }

  static get isRipAllEnabled() {
    const value = config.get("Path.ripAll.Enabled");
    return value ? value.toLowerCase() === "true" : false;
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
