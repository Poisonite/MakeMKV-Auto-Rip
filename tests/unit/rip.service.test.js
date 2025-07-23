/**
 * Unit tests for RipService with new configuration functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RipService } from "../../src/services/rip.service.js";

// Mock all dependencies
vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    isLoadDrivesEnabled: true,
    isEjectDrivesEnabled: true,
    rippingMode: "async",
    movieRipsDir: "./test-output",
    isFileLogEnabled: false,
  },
}));

vi.mock("../../src/services/disc.service.js", () => ({
  DiscService: {
    getAvailableDiscs: vi.fn(() =>
      Promise.resolve([
        { driveNumber: "0", title: "Test Movie 1", fileNumber: "1" },
        { driveNumber: "1", title: "Test Movie 2", fileNumber: "2" },
      ])
    ),
  },
}));

vi.mock("../../src/services/drive.service.js", () => ({
  DriveService: {
    loadDrivesWithWait: vi.fn(() => Promise.resolve()),
    ejectAllDrives: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    separator: vi.fn(),
  },
}));

vi.mock("../../src/utils/filesystem.js", () => ({
  FileSystemUtils: {
    createUniqueFolder: vi.fn((path, title) => `${path}/${title}`),
  },
}));

vi.mock("../../src/utils/validation.js", () => ({
  ValidationUtils: {
    isCopyComplete: vi.fn(() => true),
  },
}));

vi.mock("child_process", () => ({
  exec: vi.fn((command, callback) => {
    // Mock successful execution
    callback(null, "Mock MakeMKV output MSG:5036", "");
  }),
}));

describe("RipService", () => {
  let ripService;
  let mockAppConfig;
  let mockDriveService;
  let mockDiscService;
  let mockLogger;

  beforeEach(async () => {
    vi.clearAllMocks();
    ripService = new RipService();

    // Get mocked modules for verification
    const configModule = await import("../../src/config/index.js");
    mockAppConfig = configModule.AppConfig;

    const driveModule = await import("../../src/services/drive.service.js");
    mockDriveService = driveModule.DriveService;

    const discModule = await import("../../src/services/disc.service.js");
    mockDiscService = discModule.DiscService;

    const loggerModule = await import("../../src/utils/logger.js");
    mockLogger = loggerModule.Logger;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Drive Loading Functionality", () => {
    it("should load drives when isLoadDrivesEnabled is true", async () => {
      mockAppConfig.isLoadDrivesEnabled = true;

      await ripService.startRipping();

      expect(mockDriveService.loadDrivesWithWait).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Loading drives before ripping..."
      );
    });

    it("should not load drives when isLoadDrivesEnabled is false", async () => {
      mockAppConfig.isLoadDrivesEnabled = false;

      await ripService.startRipping();

      expect(mockDriveService.loadDrivesWithWait).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        "Loading drives before ripping..."
      );
    });
  });

  describe("Drive Ejection Functionality", () => {
    it("should eject drives when isEjectDrivesEnabled is true", async () => {
      mockAppConfig.isEjectDrivesEnabled = true;

      await ripService.ejectDiscs();

      expect(mockDriveService.ejectAllDrives).toHaveBeenCalledOnce();
    });

    it("should not eject drives when isEjectDrivesEnabled is false", async () => {
      mockAppConfig.isEjectDrivesEnabled = false;

      await ripService.ejectDiscs();

      expect(mockDriveService.ejectAllDrives).not.toHaveBeenCalled();
    });

    it("should call ejectDiscs after ripping completion", async () => {
      const ejectSpy = vi.spyOn(ripService, "ejectDiscs");

      await ripService.startRipping();

      expect(ejectSpy).toHaveBeenCalledOnce();
    });
  });

  describe("Ripping Mode Functionality", () => {
    it("should use async mode by default", async () => {
      mockAppConfig.rippingMode = "async";

      await ripService.startRipping();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Ripping discs asynchronously (parallel processing)..."
      );
    });

    it("should use sync mode when configured", async () => {
      mockAppConfig.rippingMode = "sync";

      await ripService.startRipping();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Ripping discs synchronously (one at a time)..."
      );
    });

    it("should process discs in parallel for async mode", async () => {
      mockAppConfig.rippingMode = "async";
      const ripSingleDiscSpy = vi
        .spyOn(ripService, "ripSingleDisc")
        .mockResolvedValue("Test Movie");

      await ripService.processRippingQueue([
        { title: "Movie 1", driveNumber: "0", fileNumber: "1" },
        { title: "Movie 2", driveNumber: "1", fileNumber: "2" },
      ]);

      // In async mode, ripSingleDisc should be called for both movies
      expect(ripSingleDiscSpy).toHaveBeenCalledTimes(2);
    });

    it("should process discs sequentially for sync mode", async () => {
      mockAppConfig.rippingMode = "sync";
      const ripSingleDiscSpy = vi
        .spyOn(ripService, "ripSingleDisc")
        .mockResolvedValue("Test Movie");

      await ripService.processRippingQueue([
        { title: "Movie 1", driveNumber: "0", fileNumber: "1" },
        { title: "Movie 2", driveNumber: "1", fileNumber: "2" },
      ]);

      // In sync mode, ripSingleDisc should still be called for both movies
      expect(ripSingleDiscSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle errors in async mode without stopping other operations", async () => {
      mockAppConfig.rippingMode = "async";
      const ripSingleDiscSpy = vi
        .spyOn(ripService, "ripSingleDisc")
        .mockResolvedValueOnce("Movie 1")
        .mockRejectedValueOnce(new Error("Ripping failed"));

      await ripService.processRippingQueue([
        { title: "Movie 1", driveNumber: "0", fileNumber: "1" },
        { title: "Movie 2", driveNumber: "1", fileNumber: "2" },
      ]);

      expect(ripSingleDiscSpy).toHaveBeenCalledTimes(2);
      expect(ripService.badVideoArray).toContain("Movie 2");
    });

    it("should handle errors in sync mode and continue with next disc", async () => {
      mockAppConfig.rippingMode = "sync";
      const ripSingleDiscSpy = vi
        .spyOn(ripService, "ripSingleDisc")
        .mockRejectedValueOnce(new Error("Ripping failed"))
        .mockResolvedValueOnce("Movie 2");

      await ripService.processRippingQueue([
        { title: "Movie 1", driveNumber: "0", fileNumber: "1" },
        { title: "Movie 2", driveNumber: "1", fileNumber: "2" },
      ]);

      expect(ripSingleDiscSpy).toHaveBeenCalledTimes(2);
      expect(ripService.badVideoArray).toContain("Movie 1");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete ripping workflow with all configurations enabled", async () => {
      mockAppConfig.isLoadDrivesEnabled = true;
      mockAppConfig.isEjectDrivesEnabled = true;
      mockAppConfig.rippingMode = "async";

      const loadSpy = vi.spyOn(ripService, "startRipping");
      const ejectSpy = vi.spyOn(ripService, "ejectDiscs");

      await ripService.startRipping();

      expect(mockDriveService.loadDrivesWithWait).toHaveBeenCalled();
      expect(mockDriveService.ejectAllDrives).toHaveBeenCalled();
      expect(mockDiscService.getAvailableDiscs).toHaveBeenCalled();
    });

    it("should handle complete ripping workflow with minimal configurations", async () => {
      mockAppConfig.isLoadDrivesEnabled = false;
      mockAppConfig.isEjectDrivesEnabled = false;
      mockAppConfig.rippingMode = "sync";

      await ripService.startRipping();

      expect(mockDriveService.loadDrivesWithWait).not.toHaveBeenCalled();
      expect(mockDriveService.ejectAllDrives).not.toHaveBeenCalled();
      expect(mockDiscService.getAvailableDiscs).toHaveBeenCalled();
    });
  });

  describe("Constructor and Properties", () => {
    it("should initialize with empty result arrays", () => {
      const newService = new RipService();

      expect(newService.goodVideoArray).toEqual([]);
      expect(newService.badVideoArray).toEqual([]);
    });

    it("should track successful and failed rips correctly", async () => {
      mockAppConfig.rippingMode = "async";
      const ripSingleDiscSpy = vi
        .spyOn(ripService, "ripSingleDisc")
        .mockResolvedValueOnce("Movie 1")
        .mockRejectedValueOnce(new Error("Ripping failed"));

      await ripService.processRippingQueue([
        { title: "Movie 1", driveNumber: "0", fileNumber: "1" },
        { title: "Movie 2", driveNumber: "1", fileNumber: "2" },
      ]);

      expect(ripService.badVideoArray).toContain("Movie 2");
      expect(ripService.badVideoArray).toHaveLength(1);
    });
  });
});
