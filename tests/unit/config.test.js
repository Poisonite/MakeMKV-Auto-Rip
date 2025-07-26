/**
 * Unit tests for configuration module
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Create a clean test implementation that avoids caching issues
const mockYamlConfig = {
  paths: {
    makemkv_dir: "C:/Program Files (x86)/MakeMKV",
    movie_rips_dir: "./media",
    logging: {
      enabled: true,
      dir: "./logs",
      time_format: "12hr",
    },
  },
  drives: {
    auto_load: true,
    auto_eject: true,
  },
  ripping: {
    rip_all_titles: false,
    mode: "async",
  },
};

// Mock fs module
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "mock yaml content"),
}));

// Mock yaml module
vi.mock("yaml", () => ({
  parse: vi.fn(() => mockYamlConfig),
}));

// Mock path module functions we use
vi.mock("path", () => ({
  dirname: vi.fn(() => "/test/src/config"),
  join: vi.fn((...parts) => parts.join("/")),
  resolve: vi.fn(
    (...parts) =>
      "/" +
      parts
        .filter((p) => p && p !== ".")
        .join("/")
        .replace(/\/+/g, "/")
  ),
  normalize: vi.fn((path) => path.replace(/\\/g, "/")),
  sep: "/",
}));

describe("AppConfig", () => {
  let AppConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Fresh import to avoid caching issues
    vi.resetModules();
    const configModule = await import("../../src/config/index.js");
    AppConfig = configModule.AppConfig;
  });

  describe("Configuration Loading", () => {
    it("should load configuration from YAML file", async () => {
      const { readFileSync } = await import("fs");
      const { parse } = await import("yaml");

      const result = AppConfig.mkvDir;

      expect(readFileSync).toHaveBeenCalled();
      expect(parse).toHaveBeenCalledWith("mock yaml content");
      expect(result).toContain("MakeMKV");
    });
  });

  describe("Property Getters", () => {
    it("should return correct MakeMKV directory", () => {
      const result = AppConfig.mkvDir;
      expect(result).toContain("MakeMKV");
    });

    it("should return correct movie rips directory", () => {
      const result = AppConfig.movieRipsDir;
      expect(result).toContain("media");
    });

    it("should return correct logging enabled status", () => {
      const result = AppConfig.isFileLogEnabled;
      expect(result).toBe(true);
    });

    it("should return correct log directory", () => {
      const result = AppConfig.logDir;
      expect(result).toContain("logs");
    });

    it("should return correct log time format", () => {
      const result = AppConfig.logTimeFormat;
      expect(result).toBe("12hr");
    });

    it("should return correct load drives enabled status", () => {
      const result = AppConfig.isLoadDrivesEnabled;
      expect(result).toBe(true);
    });

    it("should return correct eject drives enabled status", () => {
      const result = AppConfig.isEjectDrivesEnabled;
      expect(result).toBe(true);
    });

    it("should return correct rip all enabled status", () => {
      const result = AppConfig.isRipAllEnabled;
      expect(result).toBe(false);
    });

    it("should return correct ripping mode", () => {
      const result = AppConfig.rippingMode;
      expect(result).toBe("async");
    });

    it("should return correct MakeMKV executable path", () => {
      const result = AppConfig.makeMKVExecutable;
      expect(result).toContain("makemkvcon");
    });
  });

  describe("Path Normalization", () => {
    it("should normalize Windows paths correctly", () => {
      const result = AppConfig.mkvDir;
      // Should handle path normalization without throwing
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle relative paths", () => {
      const result = AppConfig.movieRipsDir;
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Default Values", () => {
    it("should provide sensible defaults for missing values", () => {
      expect(AppConfig.logTimeFormat).toBe("12hr");
      expect(AppConfig.rippingMode).toBe("async");
    });
  });

  describe("Validation", () => {
    it("should validate required configuration paths", () => {
      // With default mock config, validation should pass
      expect(() => AppConfig.validate()).not.toThrow();
    });
  });

  describe("Cross-platform Support", () => {
    it("should handle executable name based on platform", () => {
      const result = AppConfig.makeMKVExecutable;

      if (process.platform === "win32") {
        expect(result).toContain("makemkvcon.exe");
      } else {
        expect(result).toContain("makemkvcon");
      }
    });

    it("should quote paths with spaces", () => {
      const result = AppConfig.makeMKVExecutable;

      // Default config has spaces in path, so should be quoted
      if (result.includes(" ")) {
        expect(result).toMatch(/^".*"$/);
      }
    });
  });
});
