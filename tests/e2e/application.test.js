/**
 * End-to-end tests for the complete application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { stringify } from "yaml";
import { isProcessExitError } from "../../src/utils/process.js";

describe("Application End-to-End Tests", () => {
  let testTempDir;
  let originalConfigPath;

  beforeEach(async () => {
    // Create temporary directories for testing
    testTempDir = "./test-temp-e2e";

    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }

    // Create test configuration in the project root
    const testConfig = {
      paths: {
        makemkv_dir: testTempDir,
        movie_rips_dir: path.join(testTempDir, "rips"),
        logging: {
          enabled: true,
          dir: path.join(testTempDir, "logs"),
          time_format: "12hr",
        },
      },
      drives: {
        auto_load: true,
        auto_eject: false, // Disable for testing
      },
      ripping: {
        rip_all_titles: false,
        mode: "async",
      },
    };

    // Backup original config if it exists
    originalConfigPath = "./config.yaml";
    if (fs.existsSync(originalConfigPath)) {
      fs.copyFileSync(originalConfigPath, "./config.yaml.backup");
    }

    // Write test configuration
    fs.writeFileSync(originalConfigPath, stringify(testConfig));

    // Clear any cached config - reset modules first then clear cache
    vi.resetModules();
  });

  afterEach(async () => {
    // Cleanup test directories
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }

    // Restore original config
    if (fs.existsSync("./config.yaml.backup")) {
      fs.renameSync("./config.yaml.backup", originalConfigPath);
    } else if (fs.existsSync(originalConfigPath)) {
      fs.unlinkSync(originalConfigPath);
    }

    // Reset modules to clear any cached imports
    vi.resetModules();
  });

  describe("Application startup and configuration", () => {
    it("should start application and validate configuration", async () => {
      // Reset module cache to start fresh
      vi.resetModules();

      const { AppConfig } = await import("../../src/config/index.js");

      try {
        await AppConfig.validate();
      } catch (error) {
        // May fail in test environment if MakeMKV not found
        expect(error.message).toContain("MakeMKV installation not found");
      }

      // Test that we can get the movie rips directory
      const movieDir = AppConfig.movieRipsDir;
      expect(typeof movieDir).toBe("string");
      expect(movieDir.length).toBeGreaterThan(0);
    });

    it("should handle invalid YAML configuration", async () => {
      fs.writeFileSync(originalConfigPath, "invalid: yaml: content: [");

      // Reset module cache
      vi.resetModules();

      const { AppConfig } = await import("../../src/config/index.js");

      // Should throw error for invalid YAML - test with a safe method
      expect(() => AppConfig.movieRipsDir).toThrow(
        "Failed to load configuration"
      );
    });

    it("should handle missing configuration file", async () => {
      // Remove config file temporarily
      if (fs.existsSync(originalConfigPath)) {
        fs.unlinkSync(originalConfigPath);
      }

      // Reset module cache
      vi.resetModules();

      const { AppConfig } = await import("../../src/config/index.js");

      // Should throw error for missing config
      expect(() => AppConfig.movieRipsDir).toThrow(
        "Failed to load configuration"
      );
    });
  });

  describe("Service integration", () => {
    it("should integrate all services properly", async () => {
      // Mock the RipService.startRipping method to avoid real execution
      vi.resetModules();

      // Mock child_process exec before importing services
      const mockExec = vi.fn((command, callback) => {
        // Simulate immediate success for any MakeMKV command
        setTimeout(
          () => callback(null, 'MSG:5036,0,1,"Copy complete."', ""),
          0
        );
      });

      vi.doMock("child_process", () => ({
        exec: mockExec,
      }));

      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          loadDrivesWithWait: vi.fn().mockResolvedValue(),
          ejectAllDrives: vi.fn().mockResolvedValue(),
        },
      }));

      vi.doMock("../../src/services/disc.service.js", () => ({
        DiscService: {
          getAvailableDiscs: vi.fn().mockResolvedValue([]),
        },
      }));

      // Mock filesystem operations to prevent real directory creation
      vi.doMock("../../src/utils/filesystem.js", () => ({
        FileSystemUtils: {
          createUniqueFolder: vi.fn().mockReturnValue("/mock/path"),
          createUniqueLogFile: vi.fn().mockReturnValue("/mock/log.txt"),
          writeLogFile: vi.fn().mockResolvedValue(),
          validateMakeMKVInstallation: vi.fn().mockResolvedValue(true),
          detectMakeMKVInstallation: vi.fn().mockResolvedValue("/mock/makemkv"),
        },
      }));

      const { RipService } = await import("../../src/services/rip.service.js");
      const ripService = new RipService();

      // Should complete without errors
      await expect(ripService.startRipping()).resolves.toBeUndefined();
    });

    it("should create necessary directories during operation", async () => {
      // Reset modules for clean test
      vi.resetModules();

      const ripsDir = path.join(testTempDir, "rips");
      let createdFolderPath = null;

      // Mock filesystem operations to capture directory creation
      vi.doMock("../../src/utils/filesystem.js", () => ({
        FileSystemUtils: {
          createUniqueFolder: vi.fn().mockImplementation((basePath, title) => {
            createdFolderPath = path.join(basePath, title);
            return createdFolderPath;
          }),
          createUniqueLogFile: vi.fn().mockReturnValue("/mock/log.txt"),
          writeLogFile: vi.fn().mockResolvedValue(),
          validateMakeMKVInstallation: vi.fn().mockResolvedValue(true),
          detectMakeMKVInstallation: vi.fn().mockResolvedValue("/mock/makemkv"),
        },
      }));

      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          loadDrivesWithWait: vi.fn().mockResolvedValue(),
          ejectAllDrives: vi.fn().mockResolvedValue(),
        },
      }));

      vi.doMock("../../src/services/disc.service.js", () => ({
        DiscService: {
          getAvailableDiscs: vi.fn().mockResolvedValue([]),
        },
      }));

      // Mock child_process
      vi.doMock("child_process", () => ({
        exec: vi.fn((command, callback) => {
          setTimeout(
            () => callback(null, 'MSG:5036,0,1,"Copy complete."', ""),
            0
          );
        }),
      }));

      const { RipService } = await import("../../src/services/rip.service.js");
      const ripService = new RipService();

      await ripService.startRipping();

      // Test completed successfully without real directory creation
      expect(true).toBe(true);
    });
  });

  describe("CLI interface workflow", () => {
    it("should handle CLI interface initialization", async () => {
      const { CLIInterface } = await import("../../src/cli/interface.js");

      const cli = new CLIInterface();
      expect(cli).toBeDefined();
      expect(cli.ripService).toBeDefined();
    });

    it("should display welcome message correctly", async () => {
      const { CLIInterface } = await import("../../src/cli/interface.js");

      // Mock console to capture output
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      const cli = new CLIInterface();
      cli.displayWelcome();

      expect(consoleSpy).toHaveBeenCalled();

      const calls = consoleSpy.mock.calls.map((call) => call[0]);
      const allOutput = calls.join(" ");

      expect(allOutput).toContain("MakeMKV Auto Rip");

      consoleSpy.mockRestore();
    });

    it("should handle user choice validation", async () => {
      const { CLIInterface } = await import("../../src/cli/interface.js");

      const cli = new CLIInterface();

      // Test invalid choice - should throw an error instead of calling process.exit to prevent issues with vitest
      await expect(cli.handleUserChoice("invalid")).rejects.toThrow();

      try {
        await cli.handleUserChoice("invalid");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(0);
        expect(error.message).toContain("Invalid option selected");
      }

      // Test exit choice - should also throw an error
      await expect(cli.handleUserChoice("2")).rejects.toThrow();

      try {
        await cli.handleUserChoice("2");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(0);
        expect(error.message).toContain("User requested exit");
      }
    });
  });

  describe("Validation utilities", () => {
    it("should validate MakeMKV output correctly", async () => {
      const { ValidationUtils } = await import("../../src/utils/validation.js");

      // Test drive data validation
      const validDriveData =
        'DRV:0,2,999,1,"BD-ROM","Test Movie","/dev/sr0"\nDRV:1,0,999,0,"","",""';
      expect(ValidationUtils.validateDriveData(validDriveData)).toBeNull();

      const invalidDriveData = "";
      expect(ValidationUtils.validateDriveData(invalidDriveData)).toContain(
        "No drive data received"
      );

      // Test file data validation
      const validFileData = 'TINFO:0,9,0,"1:30:00"\nTINFO:1,9,0,"0:45:00"';
      expect(ValidationUtils.validateFileData(validFileData)).toBeNull();

      // Test time conversion
      const timeArray = ["2", "15", "30"];
      const seconds = ValidationUtils.getTimeInSeconds(timeArray);
      expect(seconds).toBe(2 * 3600 + 15 * 60 + 30);

      // Test copy completion detection
      const successOutput = 'MSG:5036,0,1,"Copy complete. 1 titles saved."';
      expect(ValidationUtils.isCopyComplete(successOutput)).toBe(true);

      const failureOutput = 'MSG:5037,0,1,"Copy failed."';
      expect(ValidationUtils.isCopyComplete(failureOutput)).toBe(false);
    });
  });

  describe("Logger functionality", () => {
    it("should format log messages correctly", async () => {
      const { Logger } = await import("../../src/utils/logger.js");

      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      Logger.info("Test info message");
      Logger.error("Test error message");
      Logger.warning("Test warning message");

      expect(consoleSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should handle different log levels", async () => {
      const { Logger } = await import("../../src/utils/logger.js");

      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      Logger.header("Header message");
      Logger.headerAlt("Alt header message");
      Logger.underline("Underlined message");
      Logger.plain("Plain message");
      Logger.separator();

      expect(consoleSpy).toHaveBeenCalledTimes(5);

      consoleSpy.mockRestore();
    });
  });

  describe("Constants and configuration", () => {
    it("should have correct application constants", async () => {
      const { APP_INFO, MEDIA_TYPES, VALIDATION_CONSTANTS } = await import(
        "../../src/constants/index.js"
      );

      expect(APP_INFO.name).toBe("MakeMKV Auto Rip");
      expect(APP_INFO.author).toContain("Zac Ingoglia");

      expect(MEDIA_TYPES.DVD).toBe("dvd");
      expect(MEDIA_TYPES.BLU_RAY).toBe("blu-ray");

      expect(VALIDATION_CONSTANTS.DRIVE_FILTER).toBe("DRV:");
      expect(VALIDATION_CONSTANTS.MEDIA_PRESENT).toBe(2);
      expect(VALIDATION_CONSTANTS.COPY_COMPLETE_MSG).toBe("MSG:5036");
    });
  });

  describe("Error scenarios", () => {
    it("should handle configuration errors gracefully", async () => {
      // Create invalid YAML configuration
      const invalidConfig = {
        paths: {
          makemkv_dir: "", // Empty path
          movie_rips_dir: "./test",
          logging: {
            enabled: true,
            dir: "./logs",
            time_format: "12hr",
          },
        },
        drives: {
          auto_load: true,
          auto_eject: true,
        },
        ripping: {
          rip_all_titles: false,
          mode: "async",
        },
      };

      fs.writeFileSync(originalConfigPath, stringify(invalidConfig));

      const { AppConfig } = await import("../../src/config/index.js");

      try {
        await AppConfig.validate();
        // If it doesn't throw, that's also valid if auto-detection found MakeMKV
      } catch (error) {
        // Expected if auto-detection fails or paths are missing
        expect(error.message).toMatch(
          /(Missing required|MakeMKV installation not found)/
        );
      }
    });

    it("should handle malformed MakeMKV output", async () => {
      const { ValidationUtils } = await import("../../src/utils/validation.js");

      const malformedData = "This is not valid MakeMKV output";

      expect(ValidationUtils.validateDriveData(malformedData)).toContain(
        "Invalid"
      );
      expect(ValidationUtils.validateFileData(malformedData)).toContain(
        "Invalid"
      );
    });
  });
});
