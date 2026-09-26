import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { HandBrakeService } from "../../src/services/handbrake.service.js";
import { AppConfig } from "../../src/config/index.js";

// Mock AppConfig with proper vi.mock
vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    handbrake: {
      enabled: true,
      cli_path: null,
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      additional_args: ""
    }
  }
}));

describe("HandBrake Integration Tests", () => {
  let testDir;
  let mockMkvFile;

  beforeEach(() => {
    // Create test directory and mock MKV file
    testDir = path.join(process.cwd(), "test-temp", "handbrake-integration");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a mock MKV file (just with some content)
    mockMkvFile = path.join(testDir, "test-movie.mkv");
    fs.writeFileSync(mockMkvFile, Buffer.alloc(1024 * 1024, 0)); // 1MB dummy file
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should validate HandBrake installation when enabled", async () => {
    // This test assumes HandBrake is actually installed
    // Skip if not available in CI environments
    if (process.env.CI && !process.env.HANDBRAKE_AVAILABLE) {
      return;
    }

    // Mock AppConfig to return enabled HandBrake config
    vi.mocked(AppConfig).handbrake = {
      enabled: true,
      cli_path: null, // Auto-detect
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      additional_args: ""
    };

    // Should not throw if HandBrake is properly installed
    await expect(HandBrakeService.validate()).resolves.not.toThrow();
  });

  it("should handle missing HandBrake gracefully", async () => {
    // Mock AppConfig to return invalid HandBrake path
    vi.mocked(AppConfig).handbrake = {
      enabled: true,
      cli_path: "/non/existent/path/HandBrakeCLI",
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      additional_args: ""
    };

    await expect(HandBrakeService.validate()).rejects.toThrow();
  });

  it("should build correct command structure", () => {
    // Mock AppConfig to return test HandBrake config
    vi.mocked(AppConfig).handbrake = {
      enabled: true,
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      additional_args: "--quality 22"
    };

    const command = HandBrakeService.buildCommand(
      "/usr/bin/HandBrakeCLI",
      mockMkvFile,
      path.join(testDir, "output.mp4")
    );

    expect(command).toContain('--input');
    expect(command).toContain('--output');
    expect(command).toContain('--preset "Fast 1080p30"');
    expect(command).toContain('--quality 22');
    expect(command).toContain('--optimize'); // MP4 optimization
  });

  it("should reject dangerous additional arguments", () => {
    // Mock AppConfig to return config with dangerous arguments
    vi.mocked(AppConfig).handbrake = {
      enabled: true,
      preset: "Fast 1080p30",
      output_format: "mp4",
      delete_original: false,
      additional_args: "--quality 22 && rm -rf /" // Test actual dangerous pattern detection
    };

    // Should throw an error due to dangerous character validation
    expect(() => {
      HandBrakeService.buildCommand(
        "/usr/bin/HandBrakeCLI",
        mockMkvFile,
        path.join(testDir, "output.mp4")
      );
    }).toThrow(/unsafe shell operators/);
  });
});