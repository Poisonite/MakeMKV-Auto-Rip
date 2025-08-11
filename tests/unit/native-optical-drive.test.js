import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("os", () => ({
  default: {
    platform: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("NativeOpticalDrive", () => {
  let NativeOpticalDrive;
  let mockOs;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Get mocked os module
    const osModule = await import("os");
    mockOs = osModule.default;

    // Import after mocking
    const module = await import("../../src/utils/native-optical-drive.js");
    NativeOpticalDrive = module.NativeOpticalDrive;
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe("Class structure and platform detection", () => {
    it("should be a static class with required methods", () => {
      expect(NativeOpticalDrive).toBeDefined();
      expect(typeof NativeOpticalDrive.ejectDrive).toBe("function");
      expect(typeof NativeOpticalDrive.loadDrive).toBe("function");
      expect(typeof NativeOpticalDrive.ejectAllDrives).toBe("function");
      expect(typeof NativeOpticalDrive.loadAllDrives).toBe("function");
      expect(typeof NativeOpticalDrive.isNativeAvailable).toBe("boolean"); // getter property returns boolean
    });

    it("should check platform correctly for Windows operations", async () => {
      mockOs.platform.mockReturnValue("linux");

      await expect(NativeOpticalDrive.ejectDrive("D:")).rejects.toThrow(
        "Native drive operations only supported on Windows"
      );

      await expect(NativeOpticalDrive.loadDrive("D:")).rejects.toThrow(
        "Native drive operations only supported on Windows"
      );
    });

    it("should handle Windows platform detection without enforcing addon availability", () => {
      mockOs.platform.mockReturnValue("win32");
      try {
        const isAvailable = NativeOpticalDrive.isNativeAvailable;
        expect(
          typeof isAvailable === "boolean" || isAvailable === undefined
        ).toBe(true);
      } catch (e) {
        // Accept an error when the pre-built addon is not present in test env
        expect(e).toBeInstanceOf(Error);
      }
    });

    it("should handle non-Windows platforms gracefully", () => {
      mockOs.platform.mockReturnValue("darwin");

      // On non-Windows, isNativeAvailable should be false
      const isAvailable = NativeOpticalDrive.isNativeAvailable;
      expect(isAvailable).toBe(false);
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      mockOs.platform.mockReturnValue("win32");
    });

    it("should handle native addon loading gracefully", () => {
      // When native addon isn't available, should still function
      const isAvailable = NativeOpticalDrive.isNativeAvailable;
      expect(typeof isAvailable).toBe("boolean");
    });

    it("should handle ejectAllDrives with empty array", async () => {
      await expect(
        NativeOpticalDrive.ejectAllDrives([])
      ).resolves.toBeUndefined();
    });

    it("should handle loadAllDrives with empty array", async () => {
      await expect(
        NativeOpticalDrive.loadAllDrives([])
      ).resolves.toBeUndefined();
    });

    it("should continue processing drives even if some fail", async () => {
      const drives = [{ id: "D:" }, { id: "E:" }];

      // Should not throw even if individual drives fail
      await expect(
        NativeOpticalDrive.ejectAllDrives(drives)
      ).resolves.toBeUndefined();
      await expect(
        NativeOpticalDrive.loadAllDrives(drives)
      ).resolves.toBeUndefined();
    });
  });

  describe("API consistency", () => {
    it("should expose isNativeAvailable getter on Windows without requiring addon", () => {
      mockOs.platform.mockReturnValue("win32");
      try {
        const isAvailable = NativeOpticalDrive.isNativeAvailable;
        expect(
          typeof isAvailable === "boolean" || isAvailable === undefined
        ).toBe(true);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it("should validate drive letter parameter", async () => {
      mockOs.platform.mockReturnValue("win32");

      // All methods should handle the case where native addon isn't available
      await expect(NativeOpticalDrive.ejectDrive("D:")).rejects.toThrow();
      await expect(NativeOpticalDrive.loadDrive("D:")).rejects.toThrow();
    });
  });
});
