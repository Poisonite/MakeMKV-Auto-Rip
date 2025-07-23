/**
 * Unit tests for main application logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isProcessExitError } from "../../src/utils/process.js";

// Mock all dependencies before importing
vi.mock("../../src/cli/interface.js", () => ({
  CLIInterface: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    validate: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    error: vi.fn(),
  },
}));

describe("Main Application (src/app.js)", () => {
  let processExitSpy;
  let consoleErrorSpy;
  let processOnSpy;
  let mockCLIInterface;
  let mockAppConfig;
  let mockLogger;
  let main;
  let setupErrorHandlers;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Spy on process methods
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => {});

    // Get mocked modules
    const { CLIInterface } = await import("../../src/cli/interface.js");
    const { AppConfig } = await import("../../src/config/index.js");
    const { Logger } = await import("../../src/utils/logger.js");

    mockCLIInterface = CLIInterface;
    mockAppConfig = AppConfig;
    mockLogger = Logger;

    // Import the main functions
    const app = await import("../../src/app.js");
    main = app.main;
    setupErrorHandlers = app.setupErrorHandlers;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  describe("Application startup", () => {
    it("should validate configuration before starting CLI", async () => {
      // Mock successful validation and CLI start
      mockAppConfig.validate.mockImplementation(() => {});
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
      }));

      // Call the main function directly
      await main();

      expect(mockAppConfig.validate).toHaveBeenCalled();
      expect(mockCLIInterface).toHaveBeenCalled();
    });

    it("should create CLIInterface instance and call start", async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const mockStart = vi.fn().mockResolvedValue(undefined);
      mockCLIInterface.mockImplementation(() => ({
        start: mockStart,
      }));

      await main();

      expect(mockCLIInterface).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("should handle configuration validation errors", async () => {
      const configError = new Error("Configuration validation failed");
      mockAppConfig.validate.mockImplementation(() => {
        throw configError;
      });

      await expect(main()).rejects.toThrow();

      try {
        await main();
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Failed to start application");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start application",
        configError.message
      );
    });

    it("should handle CLI start errors", async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const cliError = new Error("CLI failed to start");
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockRejectedValue(cliError),
      }));

      await expect(main()).rejects.toThrow();

      try {
        await main();
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Failed to start application");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start application",
        cliError.message
      );
    });
  });

  describe("Error handling setup", () => {
    it("should set up unhandled rejection handler", () => {
      setupErrorHandlers();

      expect(processOnSpy).toHaveBeenCalledWith(
        "unhandledRejection",
        expect.any(Function)
      );
    });

    it("should set up uncaught exception handler", () => {
      setupErrorHandlers();

      expect(processOnSpy).toHaveBeenCalledWith(
        "uncaughtException",
        expect.any(Function)
      );
    });

    it("should handle unhandled promise rejections", () => {
      let unhandledRejectionHandler;

      processOnSpy.mockImplementation((event, handler) => {
        if (event === "unhandledRejection") {
          unhandledRejectionHandler = handler;
        }
      });

      setupErrorHandlers();

      expect(unhandledRejectionHandler).toBeDefined();

      // Test the handler
      const testReason = "Promise rejection reason";
      const testPromise = Promise.reject(testReason).catch(() => {
        // Catch the rejection to prevent unhandled promise rejection
      });

      // In test environment, the handler should throw an error instead of calling process.exit
      expect(() =>
        unhandledRejectionHandler(testReason, testPromise)
      ).toThrow();

      try {
        unhandledRejectionHandler(testReason, testPromise);
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Unhandled Promise Rejection");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Unhandled Rejection at:",
        testPromise
      );
      expect(mockLogger.error).toHaveBeenCalledWith("Reason:", testReason);
    });

    it("should handle uncaught exceptions", () => {
      let uncaughtExceptionHandler;

      processOnSpy.mockImplementation((event, handler) => {
        if (event === "uncaughtException") {
          uncaughtExceptionHandler = handler;
        }
      });

      setupErrorHandlers();

      expect(uncaughtExceptionHandler).toBeDefined();

      // Test the handler
      const testError = new Error("Uncaught exception");

      // In test environment, the handler should throw an error instead of calling process.exit
      expect(() => uncaughtExceptionHandler(testError)).toThrow();

      try {
        uncaughtExceptionHandler(testError);
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Uncaught Exception");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Uncaught Exception:",
        testError.message
      );
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete successful startup flow", async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const mockStart = vi.fn().mockResolvedValue(undefined);
      mockCLIInterface.mockImplementation(() => ({
        start: mockStart,
      }));

      await main();

      expect(mockAppConfig.validate).toHaveBeenCalled();
      expect(mockCLIInterface).toHaveBeenCalled();
      expect(mockStart).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it("should setup all error handlers properly", () => {
      const eventHandlers = {};
      processOnSpy.mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
      });

      setupErrorHandlers();

      expect(eventHandlers.unhandledRejection).toBeDefined();
      expect(eventHandlers.uncaughtException).toBeDefined();
    });
  });

  describe("Module structure", () => {
    it("should export main function", async () => {
      const app = await import("../../src/app.js");
      expect(app.main).toBeDefined();
      expect(typeof app.main).toBe("function");
    });

    it("should export setupErrorHandlers function", async () => {
      const app = await import("../../src/app.js");
      expect(app.setupErrorHandlers).toBeDefined();
      expect(typeof app.setupErrorHandlers).toBe("function");
    });
  });

  describe("Error message formatting", () => {
    it("should format configuration errors properly", async () => {
      const configError = new Error("Missing required paths in configuration");
      mockAppConfig.validate.mockImplementation(() => {
        throw configError;
      });

      await expect(main()).rejects.toThrow();

      try {
        await main();
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Failed to start application");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start application",
        "Missing required paths in configuration"
      );
    });

    it("should format CLI errors properly", async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const cliError = new Error("CLI initialization failed");
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockRejectedValue(cliError),
      }));

      await expect(main()).rejects.toThrow();

      try {
        await main();
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Failed to start application");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start application",
        "CLI initialization failed"
      );
    });

    it("should handle errors without message property", async () => {
      const errorWithoutMessage = { toString: () => "Custom error string" };
      mockAppConfig.validate.mockImplementation(() => {
        throw errorWithoutMessage;
      });

      await expect(main()).rejects.toThrow();

      try {
        await main();
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Failed to start application");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start application",
        undefined
      );
    });
  });

  describe("Async behavior", () => {
    it("should handle async main function properly", async () => {
      let resolveValidation;
      const validationPromise = new Promise((resolve) => {
        resolveValidation = resolve;
      });

      mockAppConfig.validate.mockImplementation(() => validationPromise);

      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
      }));

      const mainPromise = main();

      // Complete validation
      resolveValidation();
      await validationPromise;
      await mainPromise;

      expect(mockCLIInterface).toHaveBeenCalled();
    });

    it("should handle CLI start promise rejection", async () => {
      mockAppConfig.validate.mockImplementation(() => {});

      let rejectCLI;
      const cliPromise = new Promise((resolve, reject) => {
        rejectCLI = reject;
      });

      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockReturnValue(cliPromise),
      }));

      const mainPromise = main();

      // Reject the CLI promise
      const cliError = new Error("Async CLI error");
      rejectCLI(cliError);

      await expect(mainPromise).rejects.toThrow();

      try {
        await main();
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(1);
        expect(error.message).toContain("Failed to start application");
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start application",
        "Async CLI error"
      );
    });
  });
});
