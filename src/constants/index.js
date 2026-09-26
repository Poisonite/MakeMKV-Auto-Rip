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
  MINIMUM_TITLE_LENGTH: 120, // seconds
});

export const HANDBRAKE_CONSTANTS = Object.freeze({
  SUPPORTED_FORMATS: ["mp4", "m4v"],
  DEFAULT_PRESET: "Fast 1080p30",
  MIN_FILE_SIZE_MB: 10, // Minimum reasonable output size
  MAX_TIMEOUT_HOURS: 12, // Maximum conversion timeout
  MIN_TIMEOUT_HOURS: 2, // Minimum conversion timeout
  PROGRESS_CHECK_INTERVAL: 30000, // 30 seconds
  COMMON_PRESETS: [
    "Fast 1080p30",
    "HQ 1080p30 Surround",
    "Super HQ 1080p30 Surround",
    "Fast 720p30",
    "Fast 480p30"
  ],
  FILE_HEADERS: Object.freeze({
    MP4: "66747970", // 'ftyp' in hex
    M4V: "66747970"  // Same as MP4
  }),
  VALIDATION: Object.freeze({
    HEADER_BYTES: 8,
    MIN_OUTPUT_SIZE_MB: 1,
    MIN_OUTPUT_SIZE_BYTES: 1024 * 1024,
    BUFFER_SIZE: 1024,
    // HandBrake can exit successfully a moment before the finished file is
    // visible to us (virus scanners and sync clients both do this on Windows).
    // Give it a short settle window before calling the encode a failure.
    OUTPUT_SETTLE_ATTEMPTS: 5,
    OUTPUT_SETTLE_DELAY_MS: 500
  }),
  TIMEOUT: Object.freeze({
    MS_PER_HOUR: 60 * 60 * 1000,
    MS_PER_MINUTE: 60 * 1000
  }),
  RETRY: Object.freeze({
    MAX_ATTEMPTS: 2,
    FALLBACK_PRESETS: Object.freeze(["Fast 1080p30", "Fast 720p30", "Fast 480p30"])
  })
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
 * MakeMKV message codes used to detect disc read-error failures so that the
 * ddrescue-based recovery flow can be triggered for damaged/scratched discs.
 */
export const MAKEMKV_READ_ERROR_MESSAGES = Object.freeze({
  READ_ERROR: "MSG:2003", // Error '...' occurred while reading '...'
  TITLE_SAVE_FAILED: "MSG:5003", // Failed to save title N to file ...
  READ_ERROR_SUMMARY: "MSG:2023", // Encountered N errors of type 'Read Error'
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
