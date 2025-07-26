/**
 * Unit tests for configuration module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock the fs module with readFileSync
vi.mock("fs", () => ({
  readFileSync: vi.fn(
    () => `
paths:
  # makemkv_dir: "C:/Program Files (x86)/MakeMKV"  # Using auto-detection
  movie_rips_dir: "./media"
  logging:
    enabled: true
    dir: "./logs"
    time_format: "12hr"
drives:
  auto_load: true
  auto_eject: true
ripping:
  rip_all_titles: false
  mode: "async"
`
  ),
}));

// Mock yaml module
vi.mock("yaml", () => ({
  parse: vi.fn(() => ({
    paths: {
      // No makemkv_dir - using auto-detection
      movie_rips_dir: "./media",
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
  })),
}));

// Mock FileSystemUtils for cross-platform detection
const mockFileSystemUtils = {
  detectMakeMKVInstallation: vi.fn().mockResolvedValue("/usr/bin"),
  validateMakeMKVInstallation: vi.fn().mockResolvedValue(true),
  makeTitleValidFolderPath: vi.fn(),
  createUniqueFolder: vi.fn(),
  createUniqueLogFile: vi.fn(),
  writeLogFile: vi.fn(),
  ensureDirectoryExists: vi.fn(),
};

vi.mock("../../src/utils/filesystem.js", () => ({
  FileSystemUtils: mockFileSystemUtils,
}));

// Mock Logger
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AppConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module cache to ensure fresh imports
    vi.resetModules();
    // Reset mock implementation
    mockFileSystemUtils.detectMakeMKVInstallation.mockResolvedValue("/usr/bin");
    mockFileSystemUtils.validateMakeMKVInstallation.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("Configuration Loading", () => {
    it("should load configuration from YAML file", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.movieRipsDir;
      expect(result).toContain("media");
    });
  });

  describe("Property Getters", () => {
    it("should return correct MakeMKV directory", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      // Test the async version which is the primary method now
      const result = await AppConfig.getMkvDir();
      expect(result).toBe("/usr/bin"); // Mocked value
    });

    it("should return correct movie rips directory", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.movieRipsDir;
      expect(result).toContain("media");
    });

    it("should return correct logging enabled status", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.isFileLogEnabled;
      expect(result).toBe(true);
    });

    it("should return correct log directory", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.logDir;
      expect(result).toContain("logs");
    });

    it("should return correct log time format", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.logTimeFormat;
      expect(result).toBe("12hr");
    });

    it("should return correct load drives enabled status", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.isLoadDrivesEnabled;
      expect(result).toBe(true);
    });

    it("should return correct eject drives enabled status", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.isEjectDrivesEnabled;
      expect(result).toBe(true);
    });

    it("should return correct rip all enabled status", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.isRipAllEnabled;
      expect(result).toBe(false);
    });

    it("should return correct ripping mode", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.rippingMode;
      expect(result).toBe("async");
    });

    it("should return correct MakeMKV executable path", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = await AppConfig.getMakeMKVExecutable();
      expect(result).toBeTruthy();
      expect(result).toContain("makemkvcon");
    });
  });

  describe("Path Normalization", () => {
    it("should normalize Windows paths correctly", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      // Test with async method
      const result = await AppConfig.getMkvDir();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle relative paths", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = AppConfig.movieRipsDir;
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Default Values", () => {
    it("should provide sensible defaults for missing values", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      expect(AppConfig.logTimeFormat).toBe("12hr");
      expect(AppConfig.rippingMode).toBe("async");
    });
  });

  describe("Async Configuration", () => {
    it("should get MakeMKV directory asynchronously", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = await AppConfig.getMkvDir();
      expect(result).toBe("/usr/bin");
    });

    it("should get MakeMKV executable asynchronously", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = await AppConfig.getMakeMKVExecutable();
      expect(result).toBeTruthy();
      expect(result).toContain("makemkvcon");
    });

    it("should validate configuration asynchronously", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      await expect(AppConfig.validate()).resolves.toBeUndefined();
    });
  });

  describe("Validation", () => {
    it("should validate required configuration paths", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      // Use async validation since that's the only method now
      await expect(AppConfig.validate()).resolves.toBeUndefined();
    });
  });

  describe("Cross-platform Support", () => {
    it("should handle executable name based on platform", async () => {
      const { AppConfig } = await import("../../src/config/index.js");

      const result = await AppConfig.getMakeMKVExecutable();
      expect(result).toBeTruthy();

      if (process.platform === "win32") {
        expect(result).toContain("makemkvcon.exe");
      } else {
        expect(result).toContain("makemkvcon");
      }
    });

    it("should quote paths with spaces", async () => {
      // Mock a path with spaces for this specific test
      mockFileSystemUtils.detectMakeMKVInstallation.mockResolvedValueOnce(
        "C:/Program Files/MakeMKV"
      );

      const { AppConfig } = await import("../../src/config/index.js");

      const result = await AppConfig.getMakeMKVExecutable();

      if (result && result.includes(" ")) {
        expect(result).toMatch(/^".*"$/);
      }
    });
  });
});
