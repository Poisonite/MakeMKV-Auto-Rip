/**
 * Unit tests for process utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  safeExit,
  isProcessExitError,
  isTestEnvironment,
  parseFakeDate,
  createDateEnvironment,
} from "../../src/utils/process.js";

describe("Process Utilities", () => {
  let originalNodeEnv;
  let processExitSpy;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  describe("isTestEnvironment", () => {
    it("should return true when NODE_ENV is test", () => {
      process.env.NODE_ENV = "test";
      expect(isTestEnvironment()).toBe(true);
    });

    it("should return true when VITEST is true", () => {
      process.env.NODE_ENV = "production";
      process.env.VITEST = "true";
      expect(isTestEnvironment()).toBe(true);
    });

    it("should return false in production environment", () => {
      process.env.NODE_ENV = "production";
      delete process.env.VITEST;
      delete globalThis.__vitest__;
      expect(isTestEnvironment()).toBe(false);
    });
  });

  describe("safeExit", () => {
    it("should throw error in test environment instead of calling process.exit", () => {
      process.env.NODE_ENV = "test";

      expect(() => safeExit(1, "Test error")).toThrow("Test error");
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it("should call process.exit in production environment", () => {
      process.env.NODE_ENV = "production";
      delete process.env.VITEST;
      delete globalThis.__vitest__;

      safeExit(1, "Production error");
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should create error with correct properties in test environment", () => {
      process.env.NODE_ENV = "test";

      try {
        safeExit(42, "Custom exit message");
      } catch (error) {
        expect(error.message).toBe("Custom exit message");
        expect(error.exitCode).toBe(42);
        expect(error.isProcessExit).toBe(true);
      }
    });

    it("should use default values when not provided", () => {
      process.env.NODE_ENV = "test";

      try {
        safeExit();
      } catch (error) {
        expect(error.message).toBe("Process exit called");
        expect(error.exitCode).toBe(0);
        expect(error.isProcessExit).toBe(true);
      }
    });
  });

  describe("isProcessExitError", () => {
    it("should return true for process exit errors", () => {
      const error = new Error("Test");
      error.isProcessExit = true;

      expect(isProcessExitError(error)).toBe(true);
    });

    it("should return false for regular errors", () => {
      const error = new Error("Regular error");

      expect(isProcessExitError(error)).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isProcessExitError(null)).toBe(false);
      expect(isProcessExitError(undefined)).toBe(false);
    });
  });

  describe("parseFakeDate", () => {
    it("should return null for null input", () => {
      expect(parseFakeDate(null)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseFakeDate("")).toBeNull();
    });

    it("should return null for whitespace-only string", () => {
      expect(parseFakeDate("   ")).toBeNull();
    });

    it("should return null for invalid date string", () => {
      expect(parseFakeDate("invalid-date")).toBeNull();
    });

    it("should parse valid date string", () => {
      const result = parseFakeDate("2024-01-15");
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // 0-indexed
      expect(result.getDate()).toBe(15);
    });

    it("should parse valid date-time string", () => {
      const result = parseFakeDate("2024-01-15 14:30:00");
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
    });
  });

  describe("createDateEnvironment", () => {
    let originalPlatform;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        writable: true,
      });
    });

    it("should return empty object for null input", () => {
      expect(createDateEnvironment(null)).toEqual({});
    });

    it("should return empty object for empty string", () => {
      expect(createDateEnvironment("")).toEqual({});
    });

    it("should return empty object for invalid date", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = createDateEnvironment("invalid-date");
      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        "Invalid fake date format: invalid-date. Using real system date."
      );
      consoleSpy.mockRestore();
    });

    it("should create Linux/macOS environment variables", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        writable: true,
      });

      const result = createDateEnvironment("2024-01-15 14:30:00");
      expect(result).toHaveProperty("FAKETIME");
      expect(result).toHaveProperty("LD_PRELOAD");
      expect(result.FAKETIME).toMatch(/2024-01-15 \d{2}:\d{2}:\d{2}/);
    });

    it("should show warning and return empty object for Windows", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = createDateEnvironment("2024-01-15 14:30:00");

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        "WARNING: Fake date feature is not supported on Windows systems. " +
          "The configured fake date '2024-01-15 14:30:00' will be ignored. " +
          "To use a different date, please change your system date and try again."
      );

      consoleSpy.mockRestore();
    });
  });
});
