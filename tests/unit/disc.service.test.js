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
vi.mock("../../src/utils/filesystem.js", () => ({
  FileSystemUtils: {
    makeTitleValidFolderPath: vi.fn().mockImplementation((title) => {
      if (!title) return "";
      // Remove quotes and clean the title string, like the real implementation
      const cleaned = title
        .replace(/^["']|["']$/g, "")
        .replace(/[<>:"/\\|?*]/g, "");
      return cleaned;
    }),
  },
}));

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

      await expect(DiscService.getAvailableDiscs()).rejects.toMatch(
        "Error: No disc found"
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
        "No drive data received from MakeMKV"
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

      await expect(DiscService.getDiscFileInfo(driveInfo)).rejects.toMatch(
        "Error reading disc"
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
});
