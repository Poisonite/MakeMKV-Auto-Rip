/**
 * Unit tests for filesystem utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs module
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

// Mock os module
vi.mock("os", () => ({
  default: {
    platform: vi.fn(),
  },
}));

// Mock Logger
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("FileSystemUtils", () => {
  let FileSystemUtils;
  let mockedOs;
  let mockedFsPromises;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Import mocked modules
    mockedOs = (await import("os")).default;
    mockedFsPromises = await import("fs/promises");

    // Import the FileSystemUtils after mocks are set up
    const module = await import("../../src/utils/filesystem.js");
    FileSystemUtils = module.FileSystemUtils;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("makeTitleValidFolderPath", () => {
    it("should remove invalid characters from titles", () => {
      const invalidTitle = 'Test<>:"/\\|?*Movie';
      const result = FileSystemUtils.makeTitleValidFolderPath(invalidTitle);
      expect(result).toBe("TestMovie");
    });

    it("should remove quotes", () => {
      const title = 'The "Best" Movie';
      const result = FileSystemUtils.makeTitleValidFolderPath(title);
      expect(result).toBe("The Best Movie");
    });
  });

  describe("MakeMKV Detection", () => {
    it("should detect MakeMKV on Windows", async () => {
      mockedOs.platform.mockReturnValue("win32");
      mockedFsPromises.access.mockResolvedValue(); // Simulates successful access

      const result = await FileSystemUtils.detectMakeMKVInstallation();
      expect(result).toBe("C:/Program Files/MakeMKV");
      expect(mockedFsPromises.access).toHaveBeenCalled();
    });

    it("should detect MakeMKV on Linux", async () => {
      mockedOs.platform.mockReturnValue("linux");
      mockedFsPromises.access.mockResolvedValue(); // Simulates successful access

      const result = await FileSystemUtils.detectMakeMKVInstallation();
      expect(result).toBe("/usr/bin");
      expect(mockedFsPromises.access).toHaveBeenCalled();
    });

    it("should detect MakeMKV on macOS", async () => {
      mockedOs.platform.mockReturnValue("darwin");
      mockedFsPromises.access.mockResolvedValue(); // Simulates successful access

      const result = await FileSystemUtils.detectMakeMKVInstallation();
      expect(result).toBe("/Applications/MakeMKV.app/Contents/MacOS");
      expect(mockedFsPromises.access).toHaveBeenCalled();
    });

    it("should return null for unsupported platform", async () => {
      mockedOs.platform.mockReturnValue("freebsd");

      const result = await FileSystemUtils.detectMakeMKVInstallation();
      expect(result).toBeNull();
    });

    it("should return null if no installation found", async () => {
      mockedOs.platform.mockReturnValue("win32");
      mockedFsPromises.access.mockRejectedValue(new Error("ENOENT")); // Simulates file not found

      const result = await FileSystemUtils.detectMakeMKVInstallation();
      expect(result).toBeNull();
    });
  });

  describe("MakeMKV Validation", () => {
    it("should validate Windows installation", async () => {
      mockedOs.platform.mockReturnValue("win32");
      mockedFsPromises.access.mockResolvedValue(); // Simulates successful access

      const result = await FileSystemUtils.validateMakeMKVInstallation(
        "C:/Program Files/MakeMKV"
      );
      expect(result).toBe(true);
      expect(mockedFsPromises.access).toHaveBeenCalled();
    });

    it("should validate Unix installation", async () => {
      mockedOs.platform.mockReturnValue("linux");
      mockedFsPromises.access.mockResolvedValue(); // Simulates successful access

      const result = await FileSystemUtils.validateMakeMKVInstallation(
        "/usr/bin"
      );
      expect(result).toBe(true);
      expect(mockedFsPromises.access).toHaveBeenCalled();
    });

    it("should return false for invalid installation", async () => {
      mockedFsPromises.access.mockRejectedValue(new Error("ENOENT")); // Simulates file not found

      const result = await FileSystemUtils.validateMakeMKVInstallation(
        "/invalid/path"
      );
      expect(result).toBe(false);
    });

    it("should return false for null path", async () => {
      const result = await FileSystemUtils.validateMakeMKVInstallation(null);
      expect(result).toBe(false);
    });
  });
});
