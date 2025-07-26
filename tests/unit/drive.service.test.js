/**
 * Unit tests for drive service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DriveService } from "../../src/services/drive.service.js";
import { OpticalDriveUtil } from "../../src/utils/optical-drive.js";

// Mock dependencies
vi.mock("../../src/utils/optical-drive.js");
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    separator: vi.fn(),
  },
}));

describe("DriveService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Constructor", () => {
    it("should throw error when instantiated", () => {
      expect(() => new DriveService()).toThrow(
        "DriveService is a static class and cannot be instantiated"
      );
    });
  });

  describe("loadAllDrives", () => {
    it("should successfully load all drives", async () => {
      vi.mocked(OpticalDriveUtil.loadAllDrives).mockResolvedValue({
        successful: 2,
        failed: 0,
      });

      await DriveService.loadAllDrives();

      expect(OpticalDriveUtil.loadAllDrives).toHaveBeenCalledOnce();
    });

    it("should handle drive loading errors", async () => {
      const error = new Error("Drive loading failed");
      vi.mocked(OpticalDriveUtil.loadAllDrives).mockRejectedValue(error);

      await expect(DriveService.loadAllDrives()).rejects.toThrow(
        "Drive loading failed"
      );
    });
  });

  describe("ejectAllDrives", () => {
    it("should successfully eject all drives", async () => {
      vi.mocked(OpticalDriveUtil.ejectAllDrives).mockResolvedValue({
        successful: 2,
        failed: 0,
      });

      await DriveService.ejectAllDrives();

      expect(OpticalDriveUtil.ejectAllDrives).toHaveBeenCalledOnce();
    });

    it("should handle drive ejection errors", async () => {
      const error = new Error("Drive ejection failed");
      vi.mocked(OpticalDriveUtil.ejectAllDrives).mockRejectedValue(error);

      await expect(DriveService.ejectAllDrives()).rejects.toThrow(
        "Drive ejection failed"
      );
    });
  });

  describe("loadDrivesWithWait", () => {
    it("should load drives and wait 5 seconds", async () => {
      vi.mocked(OpticalDriveUtil.loadAllDrives).mockResolvedValue({
        successful: 2,
        failed: 0,
      });

      // Mock setTimeout to resolve immediately for testing
      vi.spyOn(global, "setTimeout").mockImplementation((callback) => {
        callback();
        return 123;
      });

      await DriveService.loadDrivesWithWait();

      expect(OpticalDriveUtil.loadAllDrives).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it("should handle errors during load and wait", async () => {
      const error = new Error("Load with wait failed");
      vi.mocked(OpticalDriveUtil.loadAllDrives).mockRejectedValue(error);

      await expect(DriveService.loadDrivesWithWait()).rejects.toThrow(
        "Load with wait failed"
      );
    });
  });

  describe("getOpticalDrives", () => {
    it("should return optical drives from OpticalDriveUtil", async () => {
      const mockDrives = [
        {
          id: "E:",
          path: "E:",
          description: "DVD Drive",
          mediaType: "CD-ROM",
          platform: "win32",
        },
        {
          id: "F:",
          path: "F:",
          description: "Blu-ray Drive",
          mediaType: "BD-ROM",
          platform: "win32",
        },
      ];

      vi.mocked(OpticalDriveUtil.getOpticalDrives).mockResolvedValue(
        mockDrives
      );

      const result = await DriveService.getOpticalDrives();

      expect(result).toEqual(mockDrives);
      expect(OpticalDriveUtil.getOpticalDrives).toHaveBeenCalledOnce();
    });

    it("should return empty array when OpticalDriveUtil fails", async () => {
      vi.mocked(OpticalDriveUtil.getOpticalDrives).mockRejectedValue(
        new Error("Failed to get drives")
      );

      const result = await DriveService.getOpticalDrives();

      expect(result).toEqual([]);
    });
  });

  describe("wait", () => {
    it("should wait for specified milliseconds", async () => {
      vi.spyOn(global, "setTimeout").mockImplementation((callback) => {
        callback();
        return 123;
      });

      await DriveService.wait(1000);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it("should resolve after timeout", async () => {
      const startTime = Date.now();

      // Use real setTimeout for this test with very short delay
      setTimeout.mockRestore?.();

      await DriveService.wait(10);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete drive management workflow", async () => {
      const mockDrives = [
        {
          id: "E:",
          path: "E:",
          description: "DVD Drive",
          mediaType: "CD-ROM",
          platform: "win32",
        },
      ];

      vi.mocked(OpticalDriveUtil.getOpticalDrives).mockResolvedValue(
        mockDrives
      );
      vi.mocked(OpticalDriveUtil.loadAllDrives).mockResolvedValue({
        successful: 1,
        failed: 0,
      });
      vi.mocked(OpticalDriveUtil.ejectAllDrives).mockResolvedValue({
        successful: 1,
        failed: 0,
      });

      // Get drives
      const drives = await DriveService.getOpticalDrives();
      expect(drives).toHaveLength(1);

      // Load drives
      await DriveService.loadAllDrives();
      expect(OpticalDriveUtil.loadAllDrives).toHaveBeenCalledOnce();

      // Eject drives
      await DriveService.ejectAllDrives();
      expect(OpticalDriveUtil.ejectAllDrives).toHaveBeenCalledOnce();
    });

    it("should handle mixed success/failure scenarios", async () => {
      vi.mocked(OpticalDriveUtil.getOpticalDrives).mockResolvedValue([]);
      vi.mocked(OpticalDriveUtil.loadAllDrives).mockResolvedValue({
        successful: 0,
        failed: 0,
      });
      vi.mocked(OpticalDriveUtil.ejectAllDrives).mockRejectedValue(
        new Error("No drives to eject")
      );

      // Should get empty drives list
      const drives = await DriveService.getOpticalDrives();
      expect(drives).toHaveLength(0);

      // Should successfully load (even with no drives)
      await DriveService.loadAllDrives();

      // Should fail to eject
      await expect(DriveService.ejectAllDrives()).rejects.toThrow(
        "No drives to eject"
      );
    });
  });
});
