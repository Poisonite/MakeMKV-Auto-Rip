/**
 * Unit tests for Docker environment configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the config module before importing AppConfig
vi.mock("config", () => ({
  default: {
    get: vi.fn((key) => {
      const mockConfig = {
        "Path.mkvDir.Dir": "C:\\Program Files (x86)\\MakeMKV",
        "Path.movieRips.Dir": ".\\media",
        "Path.logging.toFiles": "true",
        "Path.logging.Dir": ".\\logs",
        "Path.logging.timeFormat": "12hr",
        "Path.loadDrives.Enabled": "true",
        "Path.ejectDrives.Enabled": "true",
        "Path.ripAll.Enabled": "false",
        "Path.rippingMode.Mode": "async",
      };
      return mockConfig[key];
    }),
  },
}));

import { AppConfig } from "../../src/config/index.js";

describe("AppConfig - Docker Environment", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isDockerEnvironment", () => {
    it("should return true when DOCKER_CONTAINER is set to true", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      expect(AppConfig.isDockerEnvironment).toBe(true);
    });

    it("should return false when DOCKER_CONTAINER is set to any non-true value", () => {
      process.env.DOCKER_CONTAINER = "1";
      
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });

    it("should return false when DOCKER_CONTAINER is not set", () => {
      delete process.env.DOCKER_CONTAINER;
      
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });

    it("should return false when DOCKER_CONTAINER is empty", () => {
      process.env.DOCKER_CONTAINER = "";
      
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });

    it("should return false when DOCKER_CONTAINER is false", () => {
      process.env.DOCKER_CONTAINER = "false";
      
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });

    it("should return true when NODE_ENV is production (Docker default)", () => {
      process.env.NODE_ENV = "production";
      process.env.DOCKER_CONTAINER = "true";
      
      expect(AppConfig.isDockerEnvironment).toBe(true);
    });
  });

  describe("makeMKVExecutable - Docker Environment", () => {
    it("should return linux executable path when in Docker", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      const result = AppConfig.makeMKVExecutable;
      
      expect(result).toBe("makemkvcon");
    });

    it("should return Windows executable path when not in Docker", () => {
      delete process.env.DOCKER_CONTAINER;
      
      const result = AppConfig.makeMKVExecutable;
      
      expect(result).toBe('"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"');
    });

    it("should handle custom mkv directory in Docker", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      const result = AppConfig.makeMKVExecutable;
      
      // In Docker, it should always use the system path regardless of config
      expect(result).toBe("makemkvcon");
    });
  });

  describe("Drive Operations - Docker Environment", () => {
    it("should disable drive loading when in Docker environment", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      const result = AppConfig.isLoadDrivesEnabled;
      
      expect(result).toBe(false);
    });

    it("should disable drive ejection when in Docker environment", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      const result = AppConfig.isEjectDrivesEnabled;
      
      expect(result).toBe(false);
    });

    it("should allow drive loading when not in Docker and config enables it", () => {
      delete process.env.DOCKER_CONTAINER;
      
      const result = AppConfig.isLoadDrivesEnabled;
      
      expect(result).toBe(true);
    });

    it("should allow drive ejection when not in Docker and config enables it", () => {
      delete process.env.DOCKER_CONTAINER;
      
      const result = AppConfig.isEjectDrivesEnabled;
      
      expect(result).toBe(true);
    });
  });

  describe("Configuration Integration - Docker", () => {
    it("should maintain other config values in Docker environment", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      expect(AppConfig.movieRipsDir).toBe(".\\media");
      expect(AppConfig.isFileLogEnabled).toBe(true);
      expect(AppConfig.rippingMode).toBe("async");
    });

    it("should validate successfully in Docker environment", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      expect(() => AppConfig.validate()).not.toThrow();
    });

    it("should handle missing Docker environment gracefully", () => {
      delete process.env.DOCKER_CONTAINER;
      
      expect(() => {
        AppConfig.isDockerEnvironment;
        AppConfig.makeMKVExecutable;
        AppConfig.isLoadDrivesEnabled;
        AppConfig.isEjectDrivesEnabled;
      }).not.toThrow();
    });
  });

  describe("Environment Variable Combinations", () => {
    it("should handle Docker with production NODE_ENV", () => {
      process.env.DOCKER_CONTAINER = "true";
      process.env.NODE_ENV = "production";
      
      expect(AppConfig.isDockerEnvironment).toBe(true);
      expect(AppConfig.makeMKVExecutable).toBe("makemkvcon");
      expect(AppConfig.isLoadDrivesEnabled).toBe(false);
      expect(AppConfig.isEjectDrivesEnabled).toBe(false);
    });

    it("should handle Docker with development NODE_ENV", () => {
      process.env.DOCKER_CONTAINER = "true";
      process.env.NODE_ENV = "development";
      
      expect(AppConfig.isDockerEnvironment).toBe(true);
      expect(AppConfig.makeMKVExecutable).toBe("makemkvcon");
    });

    it("should handle non-Docker with production NODE_ENV", () => {
      delete process.env.DOCKER_CONTAINER;
      process.env.NODE_ENV = "production";
      
      expect(AppConfig.isDockerEnvironment).toBe(false);
      expect(AppConfig.makeMKVExecutable).toBe('"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"');
    });
  });

  describe("Static Class Behavior", () => {
    it("should not allow instantiation", () => {
      expect(() => new AppConfig()).toThrow();
    });

    it("should have isDockerEnvironment as static getter", () => {
      expect(typeof Object.getOwnPropertyDescriptor(AppConfig, 'isDockerEnvironment').get).toBe('function');
    });
  });
});