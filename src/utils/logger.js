import chalk from "chalk";
import { format } from "date-fns";
import { AppConfig } from "../config/index.js";

/**
 * Color styling functions using chalk
 */
export const colors = {
  info: chalk.green,
  error: chalk.red,
  time: chalk.yellow,
  dash: chalk.gray,
  title: chalk.cyan,
  line1: chalk.white.bgBlack,
  line2: chalk.black.bgWhite,
  warning: chalk.white.bgRed,
  white: {
    underline: chalk.white.underline,
  },
  blue: chalk.blue,
  debug: chalk.gray,
};

/**
 * Logger utility class for consistent logging throughout the application
 */
export class Logger {
  static #verbose = false;
  static #sinks = new Set();

  static addSink(sink) {
    if (typeof sink !== "function") {
      return () => {};
    }

    Logger.#sinks.add(sink);
    return () => Logger.removeSink(sink);
  }

  static removeSink(sink) {
    Logger.#sinks.delete(sink);
  }

  static #emit(level, payload) {
    for (const sink of Logger.#sinks) {
      try {
        sink({ level, ...payload });
      } catch {
        // Sink failures must never break application logging.
      }
    }
  }

  /**
   * Enable or disable verbose/debug logging
   * @param {boolean} enabled - Whether verbose logging should be enabled
   */
  static setVerbose(enabled) {
    Logger.#verbose = !!enabled;
  }

  /**
   * Check if verbose logging is enabled
   * @returns {boolean} Whether verbose logging is enabled
   */
  static isVerbose() {
    return Logger.#verbose;
  }

  static info(message, title = null) {
    const timeFormat =
      AppConfig.logTimeFormat === "12hr" ? "h:mm:ss a" : "HH:mm:ss";
    const timestamp = colors.time(format(new Date(), timeFormat));
    const dash = colors.dash(" - ");
    const infoText = colors.info(message);

    if (title) {
      console.info(`${timestamp}${dash}${infoText}${colors.title(title)}`);
    } else {
      console.info(`${timestamp}${dash}${infoText}`);
    }

    Logger.#emit("info", { message, title });
  }

  /**
   * Log a debug message (only shown when verbose mode is enabled)
   * @param {string} message - The debug message to log
   * @param {string} [title] - Optional title to append
   */
  static debug(message, title = null) {
    if (!Logger.#verbose) {
      return;
    }
    const timeFormat =
      AppConfig.logTimeFormat === "12hr" ? "h:mm:ss a" : "HH:mm:ss";
    const timestamp = colors.time(format(new Date(), timeFormat));
    const dash = colors.dash(" - ");
    const debugText = colors.debug(`[DEBUG] ${message}`);

    if (title) {
      console.info(`${timestamp}${dash}${debugText}${colors.title(title)}`);
    } else {
      console.info(`${timestamp}${dash}${debugText}`);
    }

    Logger.#emit("debug", { message, title });
  }

  static error(message, details = null) {
    const timeFormat =
      AppConfig.logTimeFormat === "12hr" ? "h:mm:ss a" : "HH:mm:ss";
    const timestamp = colors.time(format(new Date(), timeFormat));
    const dash = colors.dash(" - ");
    const errorText = colors.error(message);

    console.error(`${timestamp}${dash}${errorText}`);
    if (details) {
      console.error(colors.blue(details));
    }

    Logger.#emit("error", { message, details });
  }

  static warning(message) {
    console.info(colors.warning(message));
    Logger.#emit("warn", { message });
  }

  static plain(message) {
    console.info(message);
    Logger.#emit("info", { message });
  }

  static separator() {
    console.info("");
  }

  static header(message) {
    console.info(colors.line1(message));
    Logger.#emit("info", { message });
  }

  static headerAlt(message) {
    console.info(colors.line2(message));
    Logger.#emit("info", { message });
  }

  static underline(message) {
    console.info(colors.white.underline(message));
    Logger.#emit("info", { message });
  }
}
