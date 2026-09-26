import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import { open, stat } from "fs/promises";
import path from "path";
import { HandBrakeService, HandBrakeError } from "../../src/services/handbrake.service.js";
import { AppConfig } from "../../src/config/index.js";
import { Logger } from "../../src/utils/logger.js";
import { HANDBRAKE_CONSTANTS } from "../../src/constants/index.js";

// Mock dependencies
vi.mock("fs");
vi.mock("fs/promises");
vi.mock("child_process");
vi.mock("os", () => ({
  availableParallelism: vi.fn(() => 8),
  cpus: vi.fn(() => Array.from({ length: 8 }, () => ({
    model: "Mock CPU",
    speed: 1000,
    times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
  })))
}));
vi.mock("../../src/utils/logger.js");
vi.mock("../../src/utils/filesystem.js");

// Mock AppConfig with a proper getter
vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    handbrake: {
      enabled: true,
      cli_path: null,
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      cpu_percent: 75,
      additional_args: "",
      subtitles: {
        enabled: true,
        lang_list: "eng,any",
        all: true,
        default: "1",
        burned: "none"
      }
    }
  }
}));

describe("HandBrakeService", () => {
  let mockAppConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked AppConfig
    const { AppConfig } = await import("../../src/config/index.js");
    mockAppConfig = AppConfig;

    // Reset mock config to defaults
    mockAppConfig.handbrake = {
      enabled: true,
      cli_path: null,
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      cpu_percent: 75,
      additional_args: "",
      subtitles: {
        enabled: true,
        lang_list: "eng,any",
        all: true,
        default: "1",
        burned: "none"
      }
    };

    Logger.info = vi.fn();
    Logger.debug = vi.fn();
    Logger.error = vi.fn();
    Logger.warn = vi.fn();
    Logger.warning = vi.fn();
  });

  describe("validateConfig", () => {
    it("should pass validation with valid config", () => {
      expect(() => HandBrakeService.validateConfig(mockAppConfig.handbrake)).not.toThrow();
    });

    it("should throw error for invalid output format", () => {
      const invalidConfig = { ...mockAppConfig.handbrake, output_format: "avi" };
      expect(() => HandBrakeService.validateConfig(invalidConfig)).toThrow(/output_format must be one of/);
    });

    it("should throw error for empty preset", () => {
      const invalidConfig = { ...mockAppConfig.handbrake, preset: "" };
      expect(() => HandBrakeService.validateConfig(invalidConfig)).toThrow(/preset is required/);
    });

    it("should throw error for conflicting additional args", () => {
      const invalidConfig = { ...mockAppConfig.handbrake, additional_args: "--input test.mkv" };
      expect(() => HandBrakeService.validateConfig(invalidConfig)).toThrow(/conflicting options/);
    });

    it("should throw error for invalid cpu percent", () => {
      const invalidConfig = { ...mockAppConfig.handbrake, cpu_percent: 0 };
      expect(() => HandBrakeService.validateConfig(invalidConfig)).toThrow(/cpu_percent must be a number between 1 and 100/);
    });

    it("should throw error for subtitle burn arguments", () => {
      const invalidConfig = { ...mockAppConfig.handbrake, additional_args: "--subtitle-burned=1" };
      expect(() => HandBrakeService.validateConfig(invalidConfig)).toThrow(/subtitle burn-in/i);
    });
  });

  describe("getHandBrakePath", () => {
    it("should use configured path when available", async () => {
      const configWithPath = { ...mockAppConfig.handbrake, cli_path: "/usr/bin/HandBrakeCLI" };
      fs.existsSync.mockReturnValue(true);

      const result = await HandBrakeService.getHandBrakePath(configWithPath);
      expect(result).toBe("/usr/bin/HandBrakeCLI");
    });

    it("should auto-detect on Windows", async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      fs.existsSync.mockImplementation((path) =>
        path === "C:/Program Files/HandBrake/HandBrakeCLI.exe"
      );

      const result = await HandBrakeService.getHandBrakePath(mockAppConfig.handbrake);
      expect(result).toBe("C:/Program Files/HandBrake/HandBrakeCLI.exe");
    });

    it("should throw error when HandBrake not found", async () => {
      fs.existsSync.mockReturnValue(false);

      await expect(HandBrakeService.getHandBrakePath(mockAppConfig.handbrake)).rejects.toThrow(/HandBrakeCLI not found/);
    });
  });

  describe("buildCommand", () => {
    it("should build basic command correctly", () => {
      const cmd = HandBrakeService.buildCommand(
        "/usr/bin/HandBrakeCLI",
        "/input/test.mkv",
        "/output/test.mp4"
      );

      expect(cmd).toContain('/usr/bin/HandBrakeCLI');
      expect(cmd).toContain('--input /input/test.mkv');
      expect(cmd).toContain('--output /output/test.mp4');
      expect(cmd).toContain('--preset "Fast 1080p30"');
      expect(cmd).toContain('--encopts threads=6');
      expect(cmd).toContain('--subtitle-lang-list eng,any');
      expect(cmd).toContain('--all-subtitles');
      expect(cmd).toContain('--subtitle-default=1');
    });

    it("should derive thread count from cpu_percent", () => {
      mockAppConfig.handbrake.cpu_percent = 50;

      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");

      expect(cmd).toContain('--encopts threads=4');
    });

    it("should include optimization for MP4 format", () => {
      mockAppConfig.handbrake.output_format = "mp4";
      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");
      expect(cmd).toContain('--optimize');
    });

    it("should include additional arguments", () => {
      mockAppConfig.handbrake.additional_args = "--quality 22 --encoder x264";
      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");
      expect(cmd).toContain('--quality 22 --encoder x264');
    });

    it("should allow additional arguments with parentheses", () => {
      mockAppConfig.handbrake.additional_args = '--encoder-preset "x264 (8-bit)"';

      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");

      expect(cmd).toContain('--encoder-preset "x264 (8-bit)"');
    });

    it("should append the configured thread limit to existing encopts", () => {
      mockAppConfig.handbrake.additional_args = '--encopts bframes=3';

      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");

      expect(cmd).toContain('--encopts bframes=3:threads=6');
    });

    it("should keep user-specified thread encopts", () => {
      mockAppConfig.handbrake.additional_args = '--encopts bframes=3:threads=2';

      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");

      expect(cmd).toContain('--encopts bframes=3:threads=2');
      expect(cmd).not.toContain('threads=6');
    });

    it("should never add subtitle burn-in flags", () => {
      mockAppConfig.handbrake.subtitles.burned = "1";

      const cmd = HandBrakeService.buildCommand("/bin/hb", "in.mkv", "out.mp4");

      expect(cmd).not.toContain('--subtitle-burned');
      expect(cmd).toContain('--all-subtitles');
    });

    it("should build executable and args separately for process execution", () => {
      const commandParts = HandBrakeService.buildCommandParts("/bin/hb", "in.mkv", "out.mp4");

      expect(commandParts.executable).toBe("/bin/hb");
      expect(commandParts.args).toEqual(
        expect.arrayContaining([
          "--input",
          "in.mkv",
          "--output",
          "out.mp4",
          "--preset",
          "Fast 1080p30"
        ])
      );
    });
  });

  describe("validateOutput", () => {
    it("should pass validation for valid file", async () => {
      // Mock fs/promises stat to return file info
      stat.mockResolvedValue({ size: 100 * 1024 * 1024 }); // 100MB

      // Mock fs/promises open to return a file handle
      const mockFileHandle = {
        read: vi.fn().mockImplementation((buffer) => {
          // Write valid MP4 header to buffer
          const header = Buffer.from("0000001866747970", "hex");
          header.copy(buffer);
          return Promise.resolve({ bytesRead: 1024 });
        }),
        close: vi.fn().mockResolvedValue()
      };
      open.mockResolvedValue(mockFileHandle);

      await expect(HandBrakeService.validateOutput("/test/output.mp4")).resolves.not.toThrow();
      expect(mockFileHandle.close).toHaveBeenCalled();
    });

    it("should throw error if file doesn't exist", async () => {
      // Mock fs/promises stat to throw ENOENT error
      const error = new Error("ENOENT: no such file or directory");
      error.code = "ENOENT";
      stat.mockRejectedValue(error);
      vi.spyOn(HandBrakeService, "sleep").mockResolvedValue();

      await expect(HandBrakeService.validateOutput("/test/output.mp4")).rejects.toThrow(/output file not created/);
      expect(stat).toHaveBeenCalledTimes(HANDBRAKE_CONSTANTS.VALIDATION.OUTPUT_SETTLE_ATTEMPTS);
    });

    it("should accept an output file that only becomes visible after a moment", async () => {
      // HandBrakeCLI can exit 0 just before the finished file shows up
      const error = new Error("ENOENT: no such file or directory");
      error.code = "ENOENT";
      stat
        .mockRejectedValueOnce(error)
        .mockResolvedValue({ size: 100 * 1024 * 1024 });
      open.mockResolvedValue({
        read: vi.fn().mockImplementation((buffer) => {
          Buffer.from("0000001866747970", "hex").copy(buffer);
          return Promise.resolve({ bytesRead: 1024 });
        }),
        close: vi.fn().mockResolvedValue()
      });
      const sleepSpy = vi.spyOn(HandBrakeService, "sleep").mockResolvedValue();

      await expect(HandBrakeService.validateOutput("/test/output.mp4")).resolves.not.toThrow();
      expect(sleepSpy).toHaveBeenCalledTimes(1);
    });

    it("should not wait out the settle window for non-ENOENT errors", async () => {
      const error = new Error("EACCES: permission denied");
      error.code = "EACCES";
      stat.mockRejectedValue(error);
      const sleepSpy = vi.spyOn(HandBrakeService, "sleep").mockResolvedValue();

      await expect(HandBrakeService.validateOutput("/test/output.mp4")).rejects.toThrow(/Failed to access output file/);
      expect(sleepSpy).not.toHaveBeenCalled();
      expect(stat).toHaveBeenCalledTimes(1);
    });

    it("should throw error for empty file", async () => {
      // Mock fs/promises stat to return 0 size
      stat.mockResolvedValue({ size: 0 });

      await expect(HandBrakeService.validateOutput("/test/output.mp4")).rejects.toThrow(/output file is empty/);
    });
  });

  describe("resolveFallbackPresets", () => {
    it("should skip the preset that just failed", () => {
      const presets = HandBrakeService.resolveFallbackPresets("Fast 1080p30");

      expect(presets).not.toContain("Fast 1080p30");
      expect(presets[0]).toBe("Fast 720p30");
    });

    it("should default to the configured preset", () => {
      mockAppConfig.handbrake.preset = "Fast 720p30";

      expect(HandBrakeService.resolveFallbackPresets()).not.toContain("Fast 720p30");
    });

    it("should keep every preset when the failed one is not a fallback", () => {
      const presets = HandBrakeService.resolveFallbackPresets("Super HQ 1080p30 Surround");

      expect(presets).toEqual([...HANDBRAKE_CONSTANTS.RETRY.FALLBACK_PRESETS]);
    });

    it("should offer enough distinct presets for every retry attempt", () => {
      const presets = HandBrakeService.resolveFallbackPresets("Fast 1080p30");

      expect(presets.length).toBeGreaterThanOrEqual(HANDBRAKE_CONSTANTS.RETRY.MAX_ATTEMPTS);
      expect(new Set(presets).size).toBe(presets.length);
    });
  });

  describe("convertFile", () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 * 1024 * 1024 }); // 1GB
    });

    it("should skip conversion when disabled", async () => {
      mockAppConfig.handbrake.enabled = false;

      const result = await HandBrakeService.convertFile("/test/input.mkv");
      expect(result).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("HandBrake post-processing is disabled, skipping...");
    });

    it("should throw error for missing input file", async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await HandBrakeService.convertFile("/test/missing.mkv");
      expect(result).toBe(false);
    });

    it("should skip retry when setup fails before command construction", async () => {
      const retrySpy = vi.spyOn(HandBrakeService, "retryConversion").mockResolvedValue(false);
      vi.spyOn(HandBrakeService, "getHandBrakePath").mockRejectedValue(
        new HandBrakeError("HandBrakeCLI not found")
      );

      const result = await HandBrakeService.convertFile("/test/input.mkv");

      expect(result).toBe(false);
      expect(retrySpy).not.toHaveBeenCalled();
    });

    it("should abort conversion without retry when the signal is already cancelled", async () => {
      const retrySpy = vi.spyOn(HandBrakeService, "retryConversion");

      const controller = new AbortController();
      controller.abort();

      const conversionPromise = HandBrakeService.convertFile("/test/input.mkv", {
        signal: controller.signal,
      });

      await expect(conversionPromise).rejects.toMatchObject({
        name: "AbortError",
        code: "ABORT_ERR",
      });
      expect(retrySpy).not.toHaveBeenCalled();
      expect(Logger.warning).toHaveBeenCalledWith(
        "HandBrake conversion cancelled: input.mkv"
      );
    });

  });
});