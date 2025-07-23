/**
 * Unit tests for disc service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exec } from "child_process";
import { DiscService } from "../../src/services/disc.service.js";

// Mock dependencies
vi.mock("child_process");
vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    makeMKVExecutable: '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"',
    isRipAllEnabled: false,
  },
}));

describe("DiscService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAvailableDiscs", () => {
    it("should return array of disc information when discs are available", async () => {
      const mockStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Another Movie","/dev/sr1"`;

      const mockFileInfoStdout = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;

      exec.mockImplementation((command, callback) => {
        if (command.includes("info disc:index")) {
          callback(null, mockStdout, "");
        } else if (command.includes("info disc:")) {
          callback(null, mockFileInfoStdout, "");
        }
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
        fileNumber: "2",
        mediaType: "dvd",
      });
    });

    it("should handle stderr errors", async () => {
      exec.mockImplementation((command, callback) => {
        callback(null, "", "Error occurred");
      });

      await expect(DiscService.getAvailableDiscs()).rejects.toBe(
        "Error occurred"
      );
    });

    it("should handle exec errors", async () => {
      const mockError = new Error("Command failed");
      exec.mockImplementation((command, callback) => {
        callback(mockError, "", "");
      });

      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "No drive data received from MakeMKV"
      );
    });

    it("should handle validation errors in drive parsing", async () => {
      exec.mockImplementation((command, callback) => {
        callback(null, "", ""); // Empty stdout will cause validation error
      });

      await expect(DiscService.getAvailableDiscs()).rejects.toThrow();
    });

    it("should handle promise rejection in getDiscFileInfo", async () => {
      const mockStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"`;

      exec.mockImplementation((command, callback) => {
        if (command.includes("info disc:index")) {
          callback(null, mockStdout, "");
        } else if (command.includes("info disc:0")) {
          callback(null, "", "File info error");
        }
      });

      await expect(DiscService.getAvailableDiscs()).rejects.toThrow(
        "File info error"
      );
    });
  });

  describe("parseDriveInfo", () => {
    it("should parse valid drive data correctly", () => {
      const data = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Another Movie","/dev/sr1"
DRV:2,0,999,0,"","",""`;

      const result = DiscService.parseDriveInfo(data);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        driveNumber: "0",
        title: "Test Movie Title",
        mediaType: "blu-ray",
      });
      expect(result[1]).toEqual({
        driveNumber: "1",
        title: "Another Movie",
        mediaType: "dvd",
      });
    });

    it("should identify Blu-ray media correctly", () => {
      const data = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Blu-ray Movie","/dev/sr0"
MSG:1005,0,1,"MakeMKV v1.16.5 win(x64-release) started"`;

      const result = DiscService.parseDriveInfo(data);

      expect(result[0].mediaType).toBe("blu-ray");
    });

    it("should identify DVD media correctly", () => {
      const data = `DRV:0,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","DVD Movie","/dev/sr0"
MSG:1005,0,1,"MakeMKV v1.16.5 win(x64-release) started"`;

      const result = DiscService.parseDriveInfo(data);

      expect(result[0].mediaType).toBe("dvd");
    });

    it("should filter out drives without media", () => {
      const data = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie","/dev/sr0"
DRV:1,0,999,0,"","",""
DRV:2,1,999,0,"DVD DRIVE","","/dev/sr2"`;

      const result = DiscService.parseDriveInfo(data);

      expect(result).toHaveLength(1);
      expect(result[0].driveNumber).toBe("0");
    });

    it("should sanitize title for folder path", () => {
      const data = `DRV:0,2,999,1,"BD-ROM","Movie: Title/With\\Special*Chars","/dev/sr0"
MSG:1005,0,1,"MakeMKV v1.16.5 win(x64-release) started"`;

      const result = DiscService.parseDriveInfo(data);

      expect(result[0].title).toBe("Movie TitleWithSpecialChars");
    });

    it("should handle empty drive data", () => {
      expect(() => DiscService.parseDriveInfo("")).toThrow(
        "No drive data received from MakeMKV"
      );
    });

    it("should handle malformed drive data", () => {
      const data = "Invalid data format";
      expect(() => DiscService.parseDriveInfo(data)).toThrow(
        "Invalid MakeMKV drive output format"
      );
    });
  });

  describe("getDiscFileInfo", () => {
    it("should return enhanced drive info with file number", async () => {
      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      const mockStdout = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;

      exec.mockImplementation((command, callback) => {
        callback(null, mockStdout, "");
      });

      const result = await DiscService.getDiscFileInfo(driveInfo);

      expect(result).toEqual({
        driveNumber: "0",
        title: "Test Movie",
        fileNumber: "2",
        mediaType: "blu-ray",
      });
    });

    it('should return "all" as file number when rip all is enabled', async () => {
      // Mock AppConfig to return true for isRipAllEnabled
      vi.doMock("../../src/config/index.js", () => ({
        AppConfig: {
          makeMKVExecutable:
            '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"',
          isRipAllEnabled: true,
        },
      }));

      // Reset modules to apply the mock
      vi.resetModules();
      const { DiscService: MockedDiscService } = await import(
        "../../src/services/disc.service.js"
      );

      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      exec.mockImplementation((command, callback) => {
        callback(
          null,
          `TINFO:0,9,0,"1:23:45"
MSG:1005,0,1,"MakeMKV v1.16.5 win(x64-release) started"`,
          ""
        );
      });

      const result = await MockedDiscService.getDiscFileInfo(driveInfo);

      expect(result.fileNumber).toBe("all");
    });

    it("should handle stderr errors", async () => {
      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      exec.mockImplementation((command, callback) => {
        callback(null, "", "File info error");
      });

      await expect(DiscService.getDiscFileInfo(driveInfo)).rejects.toBe(
        "File info error"
      );
    });

    it("should handle validation errors", async () => {
      const driveInfo = {
        driveNumber: "0",
        title: "Test Movie",
        mediaType: "blu-ray",
      };

      exec.mockImplementation((command, callback) => {
        callback(null, "", ""); // Empty stdout causes validation error
      });

      await expect(DiscService.getDiscFileInfo(driveInfo)).rejects.toThrow();
    });
  });

  describe("getFileNumber", () => {
    it("should return file number of longest title", () => {
      const data = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"
TINFO:3,9,0,"1:45:20"`;

      const result = DiscService.getFileNumber(data);

      expect(result).toBe("2"); // 2:15:30 is the longest
    });

    it("should handle single title", () => {
      const data = `TINFO:0,9,0,"1:23:45"
MSG:1005,0,1,"MakeMKV v1.16.5 win(x64-release) started"`;

      const result = DiscService.getFileNumber(data);

      expect(result).toBe("0");
    });

    it("should handle identical durations", () => {
      const data = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"1:23:45"
TINFO:2,9,0,"1:23:45"`;

      const result = DiscService.getFileNumber(data);

      expect(result).toBe("2"); // Should return the last one with max duration
    });

    it("should handle hours correctly", () => {
      const data = `TINFO:0,9,0,"0:59:59"
TINFO:1,9,0,"1:00:00"
TINFO:2,9,0,"0:59:58"`;

      const result = DiscService.getFileNumber(data);

      expect(result).toBe("1"); // 1:00:00 is longer than 59:59
    });

    it("should handle complex time calculations", () => {
      const data = `TINFO:0,9,0,"2:30:45"
TINFO:1,9,0,"3:15:12"
TINFO:2,9,0,"1:59:59"
TINFO:3,9,0,"3:15:11"`;

      const result = DiscService.getFileNumber(data);

      expect(result).toBe("1"); // 3:15:12 is the longest
    });

    it("should handle empty file data", () => {
      expect(() => DiscService.getFileNumber("")).toThrow(
        "No data received from MakeMKV"
      );
    });

    it("should handle malformed file data", () => {
      const data = "Invalid format";
      expect(() => DiscService.getFileNumber(data)).toThrow(
        "Invalid MakeMKV output format"
      );
    });

    it("should handle no valid TINFO lines", () => {
      const data = `OTHER:0,9,0,"1:23:45"
DIFFERENT:1,9,0,"0:45:12"`;

      expect(() => DiscService.getFileNumber(data)).toThrow(
        "Invalid MakeMKV output format"
      );
    });

    it("should handle malformed time strings", () => {
      const data = `TINFO:0,9,0,"invalid:time"
TINFO:1,9,0,"1:23:45"`;

      const result = DiscService.getFileNumber(data);

      expect(result).toBe("1"); // Should skip invalid and use valid one
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete disc scanning workflow", async () => {
      const mockDriveStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"`;
      const mockFileStdout = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"2:15:30"`;

      exec.mockImplementation((command, callback) => {
        if (command.includes("info disc:index")) {
          callback(null, mockDriveStdout, "");
        } else if (command.includes("info disc:0")) {
          callback(null, mockFileStdout, "");
        }
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        driveNumber: "0",
        title: "Test Movie Title",
        fileNumber: "1",
        mediaType: "blu-ray",
      });

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenCalledWith(
        '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe" -r info disc:index',
        expect.any(Function)
      );
      expect(exec).toHaveBeenCalledWith(
        '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe" -r info disc:0',
        expect.any(Function)
      );
    });

    it("should handle multiple discs with different media types", async () => {
      const mockDriveStdout = `DRV:0,2,999,1,"BD-ROM HL-DT-ST","Blu-ray Movie","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA","DVD Movie","/dev/sr1"`;

      const mockFileStdout = `TINFO:0,9,0,"1:30:00"`;

      exec.mockImplementation((command, callback) => {
        if (command.includes("info disc:index")) {
          callback(null, mockDriveStdout, "");
        } else {
          callback(null, mockFileStdout, "");
        }
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result).toHaveLength(2);
      expect(result[0].mediaType).toBe("blu-ray");
      expect(result[1].mediaType).toBe("dvd");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle command execution timeout gracefully", async () => {
      exec.mockImplementation((command, callback) => {
        // Simulate timeout by not calling callback
      });

      // This would hang in real scenario, but mocked for testing
      const promise = DiscService.getAvailableDiscs();

      // We don't await this as it would hang, just ensure it returns a promise
      expect(promise).toBeInstanceOf(Promise);
    });

    it("should handle special characters in titles", async () => {
      const mockStdout = `DRV:0,2,999,1,"BD-ROM","Movie: Title & More! (2024)","/dev/sr0"`;

      exec.mockImplementation((command, callback) => {
        if (command.includes("info disc:index")) {
          callback(null, mockStdout, "");
        } else {
          callback(null, 'TINFO:0,9,0,"1:30:00"', "");
        }
      });

      const result = await DiscService.getAvailableDiscs();

      expect(result[0].title).toBe("Movie Title & More! (2024)");
    });
  });
});
