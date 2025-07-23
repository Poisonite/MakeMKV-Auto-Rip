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
