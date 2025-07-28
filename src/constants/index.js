/**
 * Application constants
 */

export const APP_INFO = Object.freeze({
  name: "MakeMKV Auto Rip",
  version: "1.0.0",
  author: "Zac Ingoglia (Poisonite)",
  copyright: "- Created By: Zac Ingoglia (Poisonite)",
});

export const MEDIA_TYPES = Object.freeze({
  DVD: "dvd",
  BLU_RAY: "blu-ray",
});

export const LOG_LEVELS = Object.freeze({
  INFO: "info",
  ERROR: "error",
  WARNING: "warning",
});

export const VALIDATION_CONSTANTS = Object.freeze({
  DRIVE_FILTER: "DRV:",
  MEDIA_PRESENT: 2,
  TITLE_LENGTH_CODE: 9,
  COPY_COMPLETE_MSG: "MSG:5036",
});

export const MENU_OPTIONS = Object.freeze({
  RIP: "1",
  EXIT: "2",
});

/**
 * MakeMKV message codes related to program version for output parsing
 */
export const MAKEMKV_VERSION_MESSAGES = Object.freeze({
  VERSION_INFO: "MSG:1005",
  VERSION_TOO_OLD: "MSG:5021",
  UPDATE_AVAILABLE: "MSG:5075",
});

/**
 * Default MakeMKV installation paths by platform.
 * These are the most common installation locations for each platform
 */
export const PLATFORM_DEFAULTS = Object.freeze({
  MAKEMKV_PATHS: {
    win32: ["C:/Program Files/MakeMKV", "C:/Program Files (x86)/MakeMKV"],
    linux: ["/usr/bin", "/usr/local/bin", "/opt/makemkv/bin"],
    darwin: [
      "/Applications/MakeMKV.app/Contents/MacOS",
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ],
  },
});
