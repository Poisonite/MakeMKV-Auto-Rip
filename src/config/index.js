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

  static get isEjectEnabled() {
    return config.get("Path.ejectDVDs.Enabled").toLowerCase() === "true";
  }

  static get isRipAllEnabled() {
    return config.get("Path.ripAll.Enabled").toLowerCase() === "true";
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
