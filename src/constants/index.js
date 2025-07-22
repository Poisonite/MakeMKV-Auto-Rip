/**
 * Application constants
 */

export const APP_INFO = Object.freeze({
  name: "MakeMKV Auto Rip",
  version: "1.0.0",
  author: "Zac Ingoglia (Poisonite)",
  copyright: "Copyright (C) 2025 Zac Ingoglia (Poisonite)",
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
