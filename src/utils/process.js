/**
 * Process utilities for handling exit scenarios in test-safe way
 */

import { Logger } from "./logger.js";
import { systemDateManager } from "./system-date.js";

/**
 * Check if the current environment is a test environment
 * @returns {boolean} True if running in test environment
 */
export function isTestEnvironment() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    globalThis.__vitest__ !== undefined
  );
}

/**
 * Handle process exit in a test-safe way
 * In test environments, throws an error instead of calling process.exit
 * @param {number} code - Exit code
 * @param {string} message - Error message for test environments
 */
export function safeExit(code = 0, message = "Process exit called") {
  if (isTestEnvironment()) {
    // In tests, throw an error instead of calling process.exit
    const error = new Error(message);
    error.exitCode = code;
    error.isProcessExit = true;
    throw error;
  } else {
    // In production, call process.exit normally
    process.exit(code);
  }
}

/**
 * Check if an error is a process exit error from tests
 * @param {Error} error - Error to check
 * @returns {boolean} True if the error represents a process exit
 */
export function isProcessExitError(error) {
  return Boolean(error && error.isProcessExit === true);
}

/**
 * Parse and validate a fake date string
 * @param {string} fakeDateStr - Date string in format "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
 * @returns {Date|null} Parsed date object or null if invalid
 */
export function parseFakeDate(fakeDateStr) {
  if (!fakeDateStr || typeof fakeDateStr !== "string") {
    return null;
  }

  const trimmed = fakeDateStr.trim();
  if (trimmed === "") {
    return null;
  }

  // Try parsing the date string
  const date = new Date(trimmed);

  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Apply system date management for MakeMKV operations
 * @param {string|null} fakeDateStr - Fake date string or null to use real date
 * @returns {Promise<void>}
 * @throws {Error} When system date cannot be changed
 */
export async function applySystemDate(fakeDateStr) {
  if (!fakeDateStr) {
    return;
  }

  const fakeDate = parseFakeDate(fakeDateStr);
  if (!fakeDate) {
    Logger.warning(
      `Invalid fake date format: ${fakeDateStr}. Using real system date.`
    );
    return;
  }

  try {
    await systemDateManager.setSystemDate(fakeDate);
  } catch (error) {
    Logger.error(`Failed to apply system date: ${error.message}`);
    throw error;
  }
}

/**
 * Restore system date to network time
 * @returns {Promise<void>}
 */
export async function restoreSystemDate() {
  try {
    await systemDateManager.restoreSystemDate();
  } catch (error) {
    Logger.error(`Failed to restore system date: ${error.message}`);
    throw error;
  }
}

/**
 * Execute an operation with temporary system date
 * @param {string|null} fakeDateStr - Fake date string or null to use real date
 * @param {Function} operation - Async operation to execute
 * @returns {Promise<any>} Result of the operation
 */
export async function withSystemDate(fakeDateStr, operation) {
  if (!fakeDateStr) {
    return await operation();
  }

  const fakeDate = parseFakeDate(fakeDateStr);
  if (!fakeDate) {
    Logger.warning(
      `Invalid fake date format: ${fakeDateStr}. Executing operation with real system date.`
    );
    return await operation();
  }

  return await systemDateManager.withTemporaryDate(fakeDate, operation);
}
