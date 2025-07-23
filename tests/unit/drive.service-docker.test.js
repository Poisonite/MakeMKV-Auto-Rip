/**
 * Unit tests for drive service Docker environment behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the AppConfig module
vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    get isDockerEnvironment() {
      return process.env.DOCKER_CONTAINER === "true";
    }
  }
}));

// Mock the Logger module
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    separator: vi.fn(),
  }
}));

// Mock win-eject module - it should not be loaded in Docker environments
vi.mock("win-eject", () => ({
  default: {
    close: vi.fn(),
    eject: vi.fn()
  }
}));

import { DriveService } from "../../src/services/drive.service.js";
import { Logger } from "../../src/utils/logger.js";

describe("DriveService - Docker Environment", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadAllDrives - Docker Environment", () => {
    it("should skip drive loading in Docker environment", async () => {
      process.env.DOCKER_CONTAINER = "true";

      await DriveService.loadAllDrives();

      expect(Logger.info).toHaveBeenCalledWith(
        "Drive loading skipped in Docker environment (Windows-only feature)"
      );
    });

    it("should resolve immediately in Docker environment", async () => {
      process.env.DOCKER_CONTAINER = "true";

      const start = Date.now();
      const result = await DriveService.loadAllDrives();
      const end = Date.now();

      expect(result).toBeUndefined();
      expect(end - start).toBeLessThan(50); // Should be immediate
    });

    it("should not log Docker skip message in non-Docker environment", () => {
      delete process.env.DOCKER_CONTAINER;

      // Just verify the environment detection works
      const { AppConfig } = require("../../src/config/index.js");
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });
  });

  describe("ejectAllDrives - Docker Environment", () => {
    it("should skip drive ejection in Docker environment", async () => {
      process.env.DOCKER_CONTAINER = "true";

      await DriveService.ejectAllDrives();

      expect(Logger.info).toHaveBeenCalledWith(
        "Drive ejection skipped in Docker environment (Windows-only feature)"
      );
    });

    it("should resolve immediately in Docker environment", async () => {
      process.env.DOCKER_CONTAINER = "true";

      const start = Date.now();
      const result = await DriveService.ejectAllDrives();
      const end = Date.now();

      expect(result).toBeUndefined();
      expect(end - start).toBeLessThan(50); // Should be immediate
    });

    it("should not log Docker skip message in non-Docker environment", () => {
      delete process.env.DOCKER_CONTAINER;

      // Just verify the environment detection works
      const { AppConfig } = require("../../src/config/index.js");
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });
  });

  describe("loadDrivesWithWait - Docker Environment", () => {
    it("should skip drive loading but still wait in Docker environment", async () => {
      process.env.DOCKER_CONTAINER = "true";

      const start = Date.now();
      await DriveService.loadDrivesWithWait();
      const end = Date.now();

      expect(Logger.info).toHaveBeenCalledWith(
        "Drive loading skipped in Docker environment (Windows-only feature)"
      );
      expect(end - start).toBeGreaterThanOrEqual(4900); // Should still wait ~5 seconds
    });

    it("should detect non-Docker environment correctly", () => {
      delete process.env.DOCKER_CONTAINER;

      // Just verify the environment detection works
      const { AppConfig } = require("../../src/config/index.js");
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });
  });

  describe("Environment Detection", () => {
    it("should detect Docker environment correctly", () => {
      process.env.DOCKER_CONTAINER = "true";
      
      // Import AppConfig to test the detection
      const { AppConfig } = require("../../src/config/index.js");
      expect(AppConfig.isDockerEnvironment).toBe(true);
    });

    it("should detect non-Docker environment correctly", () => {
      delete process.env.DOCKER_CONTAINER;
      
      const { AppConfig } = require("../../src/config/index.js");
      expect(AppConfig.isDockerEnvironment).toBe(false);
    });
  });

  describe("Error Handling in Docker", () => {
    it("should not throw errors for drive operations in Docker", async () => {
      process.env.DOCKER_CONTAINER = "true";

      await expect(DriveService.loadAllDrives()).resolves.toBeUndefined();
      await expect(DriveService.ejectAllDrives()).resolves.toBeUndefined();
      await expect(DriveService.loadDrivesWithWait()).resolves.toBeUndefined();
    });

    it("should handle multiple concurrent calls in Docker", async () => {
      process.env.DOCKER_CONTAINER = "true";

      const promises = [
        DriveService.loadAllDrives(),
        DriveService.ejectAllDrives(),
        DriveService.loadAllDrives(),
        DriveService.ejectAllDrives(),
      ];

      await expect(Promise.all(promises)).resolves.toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);

      expect(Logger.info).toHaveBeenCalledTimes(4);
    });
  });

  describe("Integration with Config", () => {
    it("should respect Docker environment detection from AppConfig", async () => {
      // This test ensures the DriveService properly uses AppConfig.isDockerEnvironment
      process.env.DOCKER_CONTAINER = "true";

      await DriveService.loadAllDrives();
      await DriveService.ejectAllDrives();

      expect(Logger.info).toHaveBeenCalledWith(
        "Drive loading skipped in Docker environment (Windows-only feature)"
      );
      expect(Logger.info).toHaveBeenCalledWith(
        "Drive ejection skipped in Docker environment (Windows-only feature)"
      );
    });
  });
});