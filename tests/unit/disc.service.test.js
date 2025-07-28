/**
 * Unit tests for disc service
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { exec } from "child_process";

// Mock child_process
vi.mock("child_process");

// Create a mock for AppConfig that we can control
const mockAppConfig = {
  getMakeMKVExecutable: vi
    .fn()
    .mockResolvedValue('"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"'),
  isRipAllEnabled: false,
};

// Mock the config with async methods
vi.mock("../../src/config/index.js", () => ({
  AppConfig: mockAppConfig,
}));

// Mock Logger
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    separator: vi.fn(),
  },
}));

// Mock ValidationUtils to avoid validation errors
vi.mock("../../src/utils/validation.js", () => ({
  ValidationUtils: {
    validateDriveData: vi.fn().mockReturnValue(null), // null means no validation error
    validateFileData: vi.fn().mockReturnValue(null), // null means no validation error
    getTimeInSeconds: vi.fn().mockImplementation((timeArray) => {
      if (!timeArray || !Array.isArray(timeArray) || timeArray.length < 3) {
        return 0;
      }
      return +timeArray[0] * 60 * 60 + +timeArray[1] * 60 + +timeArray[2];
    }),
  },
}));

// Mock FileSystemUtils
// vi.mock("../../src/utils/filesystem.js", () => ({
//   FileSystemUtils: {
//     makeTitleValidFolderPath: vi.fn().mockImplementation((title) => {
//       if (!title) return "";
//       // Remove quotes and clean the title string, like the real implementation
//       const cleaned = title
//         .replace(/^["']|["']$/g, "")
//         .replace(/[<>:"/\\|?*]/g, "");
//       return cleaned;
//     }),
//   },
// }));

describe("DiscService", () => {
  let DiscService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mock implementations
    mockAppConfig.getMakeMKVExecutable.mockResolvedValue(
      '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"'
    );
    mockAppConfig.isRipAllEnabled = false;

    // Import DiscService after mocks are set up
    const module = await import("../../src/services/disc.service.js");
    DiscService = module.DiscService;
  });

  describe("getAvailableDiscs", () => {
    it("should return array of disc information when discs are available", async () => {
      const mockStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Another Movie","/dev/sr1"`;

      const mockFileInfoStdout = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;

      exec.mockImplementation((command, callback) => {
        // Add small delay to simulate async operation but prevent timeout
        setTimeout(() => {
          if (command.includes("info disc:index")) {
            callback(null, mockStdout, "");
          } else if (command.includes("info disc:")) {
            callback(null, mockFileInfoStdout, "");
          }
        }, 10);
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        driveNumber: "0",
        title: "Test Movie Title",
        fileNumber: "2", // Longest title (2:15:30)
        mediaType: "blu-ray",
      });
      expect(result[1]).toMatchObject({
        driveNumber: "1",
        title: "Another Movie",
        fileNumber: "2", // Longest title (2:15:30)
        mediaType: "dvd",
      });
    });

    it("should handle stderr errors", async () => {
      // Set up a valid executable first
      mockAppConfig.getMakeMKVExecutable.mockResolvedValueOnce(
        '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"'
      );

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, "", "Error: No disc found");
        }, 10);
      });

      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "No output from MakeMKV command"
      );
    });

    it("should handle empty drive output", async () => {
      // Mock validation to return an error for empty data
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.validateDriveData.mockReturnValueOnce(
        "No drive data received from MakeMKV"
      );

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, "", "");
        }, 10);
      });

      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "No output from MakeMKV command"
      );
    });

    it("should handle MakeMKV executable not found", async () => {
      mockAppConfig.getMakeMKVExecutable.mockResolvedValueOnce(null);

      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "MakeMKV executable not found"
      );
    });
  });

  describe("parseDriveInfo", () => {
    it("should parse drive information correctly", () => {
      const mockOutput = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Another Movie","/dev/sr1"`;

      const result = DiscService.parseDriveInfo(mockOutput);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        driveNumber: "0",
        mediaType: "blu-ray",
      });
      expect(result[1]).toMatchObject({
        driveNumber: "1",
        mediaType: "dvd",
      });
      expect(result[0]).toHaveProperty("title");
      expect(result[1]).toHaveProperty("title");
    });

    it("should handle empty output", async () => {
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.validateDriveData.mockReturnValueOnce(
        "No drive data received from MakeMKV"
      );

      expect(() => DiscService.parseDriveInfo("")).toThrow(
        "No drive data received from MakeMKV"
      );
    });

    it("should filter out drives without media", () => {
      const mockOutput = `DRV:0,0,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Another Movie","/dev/sr1"`;

      const result = DiscService.parseDriveInfo(mockOutput);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        driveNumber: "1",
        mediaType: "dvd",
      });
      expect(result[0]).toHaveProperty("title");
    });

    it("should determine media type based on drive description", () => {
      const mockBluRayOutput = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Movie Title","/dev/sr0"`;
      const mockDVDOutput = `DRV:0,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Movie Title","/dev/sr0"`;

      const bluRayResult = DiscService.parseDriveInfo(mockBluRayOutput);
      const dvdResult = DiscService.parseDriveInfo(mockDVDOutput);

      expect(bluRayResult[0].mediaType).toBe("blu-ray");
      expect(dvdResult[0].mediaType).toBe("dvd");
    });
  });

  describe("getDiscFileInfo", () => {
    it("should return disc info with file number", async () => {
      const mockStdout = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;

      // Set up the ValidationUtils mock for this specific test
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.getTimeInSeconds
        .mockReturnValueOnce(5025) // 1:23:45
        .mockReturnValueOnce(2712) // 0:45:12
        .mockReturnValueOnce(8130); // 2:15:30 (longest)

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, mockStdout, "");
        }, 10);
      });

      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      const result = await DiscService.getDiscFileInfo(driveInfo);

      expect(result).toMatchObject({
        driveNumber: "0",
        title: "Test Movie",
        fileNumber: "2", // Longest title should be index 2
        mediaType: "blu-ray",
      });
    });

    it("should return 'all' when rip all is enabled", async () => {
      mockAppConfig.isRipAllEnabled = true;

      const mockStdout = `TINFO:0,9,0,"1:23:45"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, mockStdout, "");
        }, 10);
      });

      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      const result = await DiscService.getDiscFileInfo(driveInfo);

      expect(result.fileNumber).toBe("all");

      // Reset for other tests
      mockAppConfig.isRipAllEnabled = false;
    });

    it("should handle stderr errors", async () => {
      // Set up a valid executable first
      mockAppConfig.getMakeMKVExecutable.mockResolvedValueOnce(
        '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"'
      );

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, "", "Error reading disc");
        }, 10);
      });

      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      await expect(DiscService.getDiscFileInfo(driveInfo)).rejects.toThrow(
        "No output from MakeMKV command"
      );
    });

    it("should handle MakeMKV executable not found", async () => {
      mockAppConfig.getMakeMKVExecutable.mockResolvedValueOnce(null);

      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      await expect(DiscService.getDiscFileInfo(driveInfo)).rejects.toThrow(
        "MakeMKV executable not found"
      );
    });
  });

  describe("getFileNumber", () => {
    it("should return the longest title index", async () => {
      // Mock the ValidationUtils getTimeInSeconds to return proper values
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.getTimeInSeconds
        .mockReturnValueOnce(5025) // 1:23:45 = 1*3600 + 23*60 + 45
        .mockReturnValueOnce(2712) // 0:45:12 = 0*3600 + 45*60 + 12
        .mockReturnValueOnce(8130) // 2:15:30 = 2*3600 + 15*60 + 30
        .mockReturnValueOnce(5400); // 1:30:00 = 1*3600 + 30*60 + 0

      const mockOutput = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"
TINFO:3,9,0,"1:30:00"`;

      const result = DiscService.getFileNumber(mockOutput);
      expect(result).toBe("2"); // Index of longest title (2:15:30)
    });

    it("should handle single title", async () => {
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.getTimeInSeconds.mockReturnValueOnce(5025); // 1:23:45

      const mockOutput = `TINFO:0,9,0,"1:23:45"`;

      const result = DiscService.getFileNumber(mockOutput);
      expect(result).toBe("0");
    });

    it("should handle empty output", async () => {
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.validateFileData.mockReturnValueOnce(
        "No data received from MakeMKV"
      );

      expect(() => DiscService.getFileNumber("")).toThrow(
        "No data received from MakeMKV"
      );
    });

    it("should handle malformed time entries", async () => {
      const { ValidationUtils } = await import("../../src/utils/validation.js");
      ValidationUtils.getTimeInSeconds
        .mockReturnValueOnce(0) // invalid time
        .mockReturnValueOnce(5025) // 1:23:45 = valid
        .mockReturnValueOnce(0); // malformed time

      const mockOutput = `TINFO:0,9,0,"invalid"
TINFO:1,9,0,"1:23:45"
TINFO:2,9,0,"malformed"`;

      const result = DiscService.getFileNumber(mockOutput);
      expect(result).toBe("1"); // Only valid entry
    });
  });

  describe("detectAvailableDiscs", () => {
    it("should detect discs without processing file information", async () => {
      const mockStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST","Test Movie","/dev/sr0"
DRV:1,2,999,1,"DVD","Another Movie","/dev/sr1"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, mockStdout, "");
        }, 10);
      });

      const result = await DiscService.detectAvailableDiscs();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      });
      expect(result[1]).toMatchObject({
        driveNumber: "1",
        title: "Another Movie",
        mediaType: "dvd",
      });
    });

    it("should handle empty output in detectAvailableDiscs", async () => {
      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, "", "");
        }, 10);
      });

      await expect(DiscService.detectAvailableDiscs()).rejects.toThrow(
        "No output from MakeMKV command"
      );
    });

    it("should handle MakeMKV executable not found in detectAvailableDiscs", async () => {
      mockAppConfig.getMakeMKVExecutable.mockResolvedValueOnce(null);

      await expect(DiscService.detectAvailableDiscs()).rejects.toThrow(
        "MakeMKV executable not found"
      );
    });
  });

  describe("waitForDriveMount", () => {
    beforeEach(() => {
      // Mock AppConfig for mount detection settings
      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          ...mockAppConfig,
          mountWaitTimeout: 5,
          mountPollInterval: 1,
        },
      }));
    });

    it("should wait for drives to mount and return new discs", async () => {
      // Mock DriveService.getDriveMountStatus
      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          getDriveMountStatus: vi
            .fn()
            .mockResolvedValueOnce({ total: 2, mounted: 1, unmounted: 1 }) // First call
            .mockResolvedValueOnce({ total: 2, mounted: 2, unmounted: 0 }), // Second call
        },
      }));

      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,2,999,1,"DVD","Movie 2","/dev/sr1"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, mockStdout, "");
        }, 10);
      });

      const result = await DiscService.waitForDriveMount();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        driveNumber: "0",
        title: "Movie 1",
        mediaType: "blu-ray",
      });
      expect(result[1]).toMatchObject({
        driveNumber: "1",
        title: "Movie 2",
        mediaType: "dvd",
      });
    });

    it("should return empty array when no new discs are found", async () => {
      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          getDriveMountStatus: vi
            .fn()
            .mockResolvedValue({ total: 1, mounted: 1, unmounted: 0 }),
        },
      }));

      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, mockStdout, "");
        }, 10);
      });

      const result = await DiscService.waitForDriveMount();

      expect(result).toHaveLength(0);
    });
  });

  describe("getCompleteDiscInfo", () => {
    it("should process complete disc information for all discs", async () => {
      const detectedDiscs = [
        { driveNumber: "0", title: "Movie 1", mediaType: "blu-ray" },
        { driveNumber: "1", title: "Movie 2", mediaType: "dvd" },
      ];

      const mockFileInfoStdout = `TINFO:0,9,0,"1:30:00"
TINFO:1,9,0,"0:45:00"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(null, mockFileInfoStdout, "");
        }, 10);
      });

      const result = await DiscService.getCompleteDiscInfo(detectedDiscs);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        driveNumber: "0",
        title: "Movie 1",
        mediaType: "blu-ray",
        fileNumber: "0", // Longest title
      });
      expect(result[1]).toMatchObject({
        driveNumber: "1",
        title: "Movie 2",
        mediaType: "dvd",
        fileNumber: "0", // Longest title
      });
    });

    it("should handle errors in getCompleteDiscInfo", async () => {
      const detectedDiscs = [
        { driveNumber: "0", title: "Movie 1", mediaType: "blu-ray" },
      ];

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          callback(new Error("MakeMKV error"), "", "");
        }, 10);
      });

      await expect(
        DiscService.getCompleteDiscInfo(detectedDiscs)
      ).rejects.toThrow();
    });
  });

  describe("Enhanced getAvailableDiscs with mount detection", () => {
    beforeEach(() => {
      // Mock AppConfig for mount detection settings
      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          ...mockAppConfig,
          mountWaitTimeout: 10,
          mountPollInterval: 1,
        },
      }));
    });

    it("should proceed immediately when all drives are ready", async () => {
      // Mock DriveService.getDriveMountStatus to return no unmounted drives
      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          getDriveMountStatus: vi
            .fn()
            .mockResolvedValue({ total: 2, mounted: 2, unmounted: 0 }),
        },
      }));

      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,2,999,1,"DVD","Movie 2","/dev/sr1"`;

      const mockFileInfoStdout = `TINFO:0,9,0,"1:30:00"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes("info disc:index")) {
            callback(null, mockStdout, "");
          } else if (command.includes("info disc:")) {
            callback(null, mockFileInfoStdout, "");
          }
        }, 10);
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        driveNumber: "0",
        title: "Movie 1",
        mediaType: "blu-ray",
        fileNumber: "0",
      });
    });

    it("should wait for drives when unmounted drives are detected", async () => {
      // Mock DriveService to return unmounted drives initially, then all mounted
      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          getDriveMountStatus: vi
            .fn()
            .mockResolvedValueOnce({ total: 2, mounted: 1, unmounted: 1 }) // First call
            .mockResolvedValueOnce({ total: 2, mounted: 2, unmounted: 0 }), // Second call
        },
      }));

      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,2,999,1,"DVD","Movie 2","/dev/sr1"`;

      const mockFileInfoStdout = `TINFO:0,9,0,"1:30:00"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes("info disc:index")) {
            callback(null, mockStdout, "");
          } else if (command.includes("info disc:")) {
            callback(null, mockFileInfoStdout, "");
          }
        }, 10);
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result).toHaveLength(2);
    });

    it("should handle case when no discs detected but drives exist", async () => {
      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          getDriveMountStatus: vi
            .fn()
            .mockResolvedValue({ total: 2, mounted: 0, unmounted: 2 }),
        },
      }));

      // Mock exec to return no discs detected (empty output for disc detection)
      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes("info disc:index")) {
            callback(null, "", ""); // No discs detected
          } else if (command.includes("info disc:")) {
            callback(null, "", ""); // No file info
          }
        }, 10);
      });

      // Should throw an error when no discs are detected
      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "No output from MakeMKV command"
      );
    });

    it("should handle case when no drives exist", async () => {
      vi.doMock("../../src/services/drive.service.js", () => ({
        DriveService: {
          getDriveMountStatus: vi
            .fn()
            .mockResolvedValue({ total: 0, mounted: 0, unmounted: 0 }),
        },
      }));

      // Mock exec to return no discs detected (empty output for disc detection)
      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes("info disc:index")) {
            callback(null, "", ""); // No discs detected
          } else if (command.includes("info disc:")) {
            callback(null, "", ""); // No file info
          }
        }, 10);
      });

      // Should throw an error when no discs are detected
      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "No output from MakeMKV command"
      );
    });

    it("should disable mount detection when timeout is 0", async () => {
      // Mock AppConfig to disable mount detection
      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          ...mockAppConfig,
          mountWaitTimeout: 0,
          mountPollInterval: 1,
        },
      }));

      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"`;
      const mockFileInfoStdout = `TINFO:0,9,0,"1:30:00"`;

      exec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes("info disc:index")) {
            callback(null, mockStdout, "");
          } else if (command.includes("info disc:")) {
            callback(null, mockFileInfoStdout, "");
          }
        }, 10);
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result).toHaveLength(1);
      // Should not call DriveService.getDriveMountStatus when disabled
    });
  });
});
