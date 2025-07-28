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
    it("should load drives and complete successfully", async () => {
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

  describe("getDriveMountStatus", () => {
    beforeEach(() => {
      // Mock child_process exec
      vi.doMock("child_process", () => ({
        exec: vi.fn(),
      }));
    });

    it("should return mount status for drives with mounted media", async () => {
      const { exec } = await import("child_process");
      const mockStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST","Movie 1","/dev/sr0"
DRV:1,2,999,1,"DVD","Movie 2","/dev/sr1"
DRV:2,0,999,1,"BD-ROM","Empty Drive","/dev/sr2"`;

      exec.mockImplementation((command, callback) => {
        callback(null, mockStdout, "");
      });

      // Mock AppConfig
      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          getMakeMKVExecutable: vi.fn().mockResolvedValue('"makemkvcon"'),
        },
      }));

      const { DriveService } = await import(
        "../../src/services/drive.service.js"
      );
      const result = await DriveService.getDriveMountStatus();

      expect(result).toEqual({
        total: 3,
        mounted: 2,
        unmounted: 1,
      });
    });

    it("should return zero counts when no drives are found", async () => {
      const { exec } = await import("child_process");
      exec.mockImplementation((command, callback) => {
        callback(null, "", "");
      });

      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          getMakeMKVExecutable: vi.fn().mockResolvedValue('"makemkvcon"'),
        },
      }));

      const { DriveService } = await import(
        "../../src/services/drive.service.js"
      );
      const result = await DriveService.getDriveMountStatus();

      expect(result).toEqual({
        total: 0,
        mounted: 0,
        unmounted: 0,
      });
    });

    it("should filter out virtual drives (state 256)", async () => {
      const { exec } = await import("child_process");
      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,256,999,1,"Virtual Drive","Virtual","/dev/sr1"
DRV:2,2,999,1,"DVD","Movie 2","/dev/sr2"`;

      exec.mockImplementation((command, callback) => {
        callback(null, mockStdout, "");
      });

      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          getMakeMKVExecutable: vi.fn().mockResolvedValue('"makemkvcon"'),
        },
      }));

      const { DriveService } = await import(
        "../../src/services/drive.service.js"
      );
      const result = await DriveService.getDriveMountStatus();

      expect(result).toEqual({
        total: 2, // Only real drives, excluding virtual drive
        mounted: 2,
        unmounted: 0,
      });
    });

    it("should handle MakeMKV executable not found", async () => {
      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          getMakeMKVExecutable: vi.fn().mockResolvedValue(null),
        },
      }));

      const { DriveService } = await import(
        "../../src/services/drive.service.js"
      );
      const result = await DriveService.getDriveMountStatus();

      expect(result).toEqual({
        total: 0,
        mounted: 0,
        unmounted: 0,
      });
    });

    it("should handle exec errors gracefully", async () => {
      const { exec } = await import("child_process");
      exec.mockImplementation((command, callback) => {
        callback(new Error("MakeMKV not found"), "", "");
      });

      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          getMakeMKVExecutable: vi.fn().mockResolvedValue('"makemkvcon"'),
        },
      }));

      const { DriveService } = await import(
        "../../src/services/drive.service.js"
      );
      const result = await DriveService.getDriveMountStatus();

      expect(result).toEqual({
        total: 0,
        mounted: 0,
        unmounted: 0,
      });
    });

    it("should correctly identify mounted vs unmounted drives", async () => {
      const { exec } = await import("child_process");
      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,0,999,1,"DVD","","/dev/sr1"
DRV:2,2,999,1,"BD-ROM","Movie 2","/dev/sr2"
DRV:3,0,999,1,"DVD","","/dev/sr3"`;

      exec.mockImplementation((command, callback) => {
        callback(null, mockStdout, "");
      });

      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          getMakeMKVExecutable: vi.fn().mockResolvedValue('"makemkvcon"'),
        },
      }));

      const { DriveService } = await import(
        "../../src/services/drive.service.js"
      );
      const result = await DriveService.getDriveMountStatus();

      expect(result).toEqual({
        total: 4,
        mounted: 2, // Only drives with state 2 AND media title
        unmounted: 2, // Drives with state 0 or no media title
      });
    });
  });
});
