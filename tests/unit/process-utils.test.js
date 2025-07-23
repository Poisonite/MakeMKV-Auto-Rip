/**
 * Unit tests for process utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  safeExit,
  isProcessExitError,
  isTestEnvironment,
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
});
