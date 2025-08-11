/**
 * Unit tests for process utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  safeExit,
  isProcessExitError,
  isTestEnvironment,
  parseFakeDate,
  applySystemDate,
  restoreSystemDate,
  withSystemDate,
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
    processExitSpy.mockRestore();
  });

  describe("isTestEnvironment", () => {
    it("should return true when NODE_ENV is test", () => {
      process.env.NODE_ENV = "test";
      expect(isTestEnvironment()).toBe(true);
    });

    it("should return true when VITEST is true", () => {
      process.env.VITEST = "true";
      expect(isTestEnvironment()).toBe(true);
    });

    it("should return true when globalThis.__vitest__ is defined", () => {
      globalThis.__vitest__ = {};
      expect(isTestEnvironment()).toBe(true);
      delete globalThis.__vitest__;
    });

    it("should return false in non-test environment", () => {
      process.env.NODE_ENV = "production";
      delete process.env.VITEST;
      expect(isTestEnvironment()).toBe(false);
    });
  });

  describe("safeExit", () => {
    it("should throw error in test environment", () => {
      process.env.NODE_ENV = "test";

      expect(() => safeExit(1, "Test exit")).toThrow("Test exit");
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it("should call process.exit in non-test environment", () => {
      process.env.NODE_ENV = "production";
      delete process.env.VITEST;

      try {
        safeExit(1, "Production exit");
      } catch (error) {
        // Expect process.exit to be called, but it's mocked
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should use default parameters", () => {
      process.env.NODE_ENV = "test";

      expect(() => safeExit()).toThrow("Process exit called");

      const error = (() => {
        try {
          safeExit();
        } catch (e) {
          return e;
        }
      })();

      expect(error.exitCode).toBe(0);
    });
  });

  describe("isProcessExitError", () => {
    it("should return true for process exit errors", () => {
      try {
        process.env.NODE_ENV = "test";
        safeExit(1, "Test error");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
      }
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
      expect(parseFakeDate(null)).toBe(null);
    });

    it("should return null for empty string", () => {
      expect(parseFakeDate("")).toBe(null);
    });

    it("should return null for whitespace-only string", () => {
      expect(parseFakeDate("   ")).toBe(null);
    });

    it("should return null for invalid date string", () => {
      expect(parseFakeDate("invalid-date")).toBe(null);
    });

    it("should parse valid date string", () => {
      const result = parseFakeDate("2024-01-15");
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January is 0
      expect(result.getDate()).toBe(15);
    });

    it("should parse valid date-time string", () => {
      const result = parseFakeDate("2024-01-15 14:30:00");
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });
  });

  describe("System Date Management", () => {
    it("should handle null fake date string gracefully", async () => {
      // Mock Logger to avoid actual logging during tests
      const Logger = await import("../../src/utils/logger.js");
      const loggerSpy = vi
        .spyOn(Logger.Logger, "info")
        .mockImplementation(() => {});

      await expect(applySystemDate(null)).resolves.toBeUndefined();

      loggerSpy.mockRestore();
    });

    it("should handle empty fake date string gracefully", async () => {
      // Mock Logger to avoid actual logging during tests
      const Logger = await import("../../src/utils/logger.js");
      const loggerSpy = vi
        .spyOn(Logger.Logger, "info")
        .mockImplementation(() => {});

      await expect(applySystemDate("")).resolves.toBeUndefined();

      loggerSpy.mockRestore();
    });

    it("should handle invalid fake date string gracefully", async () => {
      // Mock Logger to avoid actual logging during tests
      const Logger = await import("../../src/utils/logger.js");
      const loggerSpy = vi
        .spyOn(Logger.Logger, "warn")
        .mockImplementation(() => {});

      await expect(applySystemDate("invalid-date")).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        "Invalid fake date format: invalid-date. Using real system date."
      );

      loggerSpy.mockRestore();
    });

    it("should execute operation with real date when no fake date provided", async () => {
      let operationExecuted = false;
      const operation = async () => {
        operationExecuted = true;
        return "success";
      };

      const result = await withSystemDate(null, operation);
      expect(result).toBe("success");
      expect(operationExecuted).toBe(true);
    });

    it("should execute operation with real date when invalid fake date provided", async () => {
      let operationExecuted = false;
      const operation = async () => {
        operationExecuted = true;
        return "success";
      };

      const result = await withSystemDate("invalid-date", operation);
      expect(result).toBe("success");
      expect(operationExecuted).toBe(true);
    });
  });
});
