/**
 * Process utilities for handling exit scenarios in test-safe way
 */

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
 * Create environment variables for setting fake date on different platforms
 * @param {string|null} fakeDateStr - Fake date string or null to use real date
 * @returns {Object} Environment object to merge with process environment
 */
export function createDateEnvironment(fakeDateStr) {
  if (!fakeDateStr) {
    return {};
  }

  const fakeDate = parseFakeDate(fakeDateStr);
  if (!fakeDate) {
    console.warn(
      `Invalid fake date format: ${fakeDateStr}. Using real system date.`
    );
    return {};
  }

  // For Windows: Show warning and don't fake the date
  if (process.platform === "win32") {
    console.warn(
      `WARNING: Fake date feature is not supported on Windows systems. ` +
        `The configured fake date '${fakeDateStr}' will be ignored. ` +
        `To use a different date, please change your system date and try again.`
    );
    return {};
  }

  // For Linux/macOS: use faketime/libfaketime
  const env = {};
  const dateStr = fakeDate.toISOString().slice(0, 19).replace("T", " ");
  env.FAKETIME = dateStr;
  env.LD_PRELOAD =
    "/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1:/usr/lib/faketime/libfaketime.so.1";

  return env;
}
