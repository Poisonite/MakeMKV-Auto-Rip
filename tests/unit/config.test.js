/**
 * Unit tests for configuration module
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the config module before importing AppConfig
vi.mock("config", () => ({
  default: {
    get: vi.fn((key) => {
      const mockConfig = {
        "Path.mkvDir.Dir": "C:\\Program Files (x86)\\MakeMKV",
        "Path.movieRips.Dir": ".\\media",
        "Path.logToFiles.Enabled": "true",
        "Path.logToFiles.Dir": ".\\logs",
        "Path.ejectDVDs.Enabled": "true",
        "Path.ripAll.Enabled": "false",
      };
      return mockConfig[key];
    }),
  },
}));

import { AppConfig } from "../../src/config/index.js";
import config from "config";

describe("AppConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Property Getters", () => {
    describe("mkvDir", () => {
      it("should return correct MakeMKV directory", () => {
        const result = AppConfig.mkvDir;

        expect(config.get).toHaveBeenCalledWith("Path.mkvDir.Dir");
        expect(result).toBe("C:\\Program Files (x86)\\MakeMKV");
      });

      it("should handle different directory paths", () => {
        config.get.mockReturnValueOnce("D:\\Custom\\MakeMKV\\Path");

        const result = AppConfig.mkvDir;

        expect(result).toBe("D:\\Custom\\MakeMKV\\Path");
      });
    });

    describe("movieRipsDir", () => {
      it("should return correct movie rips directory", () => {
        const result = AppConfig.movieRipsDir;

        expect(config.get).toHaveBeenCalledWith("Path.movieRips.Dir");
        expect(result).toBe(".\\media");
      });

      it("should handle absolute paths", () => {
        config.get.mockReturnValueOnce("C:\\Users\\User\\Movies");

        const result = AppConfig.movieRipsDir;

        expect(result).toBe("C:\\Users\\User\\Movies");
      });
    });

    describe("isFileLogEnabled", () => {
      it("should return true when logging is enabled", () => {
        config.get.mockReturnValueOnce("true");

        const result = AppConfig.isFileLogEnabled;

        expect(config.get).toHaveBeenCalledWith("Path.logToFiles.Enabled");
        expect(result).toBe(true);
      });

      it('should return true for "TRUE" (uppercase)', () => {
        config.get.mockReturnValueOnce("TRUE");

        const result = AppConfig.isFileLogEnabled;

        expect(result).toBe(true);
      });

      it("should return false when logging is disabled", () => {
        config.get.mockReturnValueOnce("false");

        const result = AppConfig.isFileLogEnabled;

        expect(result).toBe(false);
      });

      it("should return false for invalid values", () => {
        config.get.mockReturnValueOnce("maybe");

        const result = AppConfig.isFileLogEnabled;

        expect(result).toBe(false);
      });

      it("should return false for empty string", () => {
        config.get.mockReturnValueOnce("");

        const result = AppConfig.isFileLogEnabled;

        expect(result).toBe(false);
      });
    });

    describe("logDir", () => {
      it("should return correct log directory", () => {
        const result = AppConfig.logDir;

        expect(config.get).toHaveBeenCalledWith("Path.logToFiles.Dir");
        expect(result).toBe(".\\logs");
      });

      it("should handle custom log directory", () => {
        config.get.mockReturnValueOnce("C:\\CustomLogs");

        const result = AppConfig.logDir;

        expect(result).toBe("C:\\CustomLogs");
      });
    });

    describe("isEjectEnabled", () => {
      it("should return true when ejection is enabled", () => {
        config.get.mockReturnValueOnce("true");

        const result = AppConfig.isEjectEnabled;

        expect(config.get).toHaveBeenCalledWith("Path.ejectDVDs.Enabled");
        expect(result).toBe(true);
      });

      it("should return false when ejection is disabled", () => {
        config.get.mockReturnValueOnce("false");

        const result = AppConfig.isEjectEnabled;

        expect(result).toBe(false);
      });

      it("should be case insensitive", () => {
        config.get.mockReturnValueOnce("True");

        const result = AppConfig.isEjectEnabled;

        expect(result).toBe(true);
      });
    });

    describe("isRipAllEnabled", () => {
      it("should return false when rip all is disabled", () => {
        config.get.mockReturnValueOnce("false");

        const result = AppConfig.isRipAllEnabled;

        expect(config.get).toHaveBeenCalledWith("Path.ripAll.Enabled");
        expect(result).toBe(false);
      });

      it("should return true when rip all is enabled", () => {
        config.get.mockReturnValueOnce("true");

        const result = AppConfig.isRipAllEnabled;

        expect(result).toBe(true);
      });

      it("should handle mixed case", () => {
        config.get.mockReturnValueOnce("TrUe");

        const result = AppConfig.isRipAllEnabled;

        expect(result).toBe(true);
      });
    });

    describe("makeMKVExecutable", () => {
      it("should return properly quoted executable path", () => {
        const result = AppConfig.makeMKVExecutable;

        expect(result).toBe(
          '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"'
        );
      });

      it("should handle custom MakeMKV directory", () => {
        config.get.mockReturnValueOnce("D:\\Tools\\MakeMKV");

        const result = AppConfig.makeMKVExecutable;

        expect(result).toBe('"D:\\Tools\\MakeMKV\\makemkvcon.exe"');
      });

      it("should always include quotes for spaces in path", () => {
        config.get.mockReturnValueOnce("C:\\Program Files\\Custom MakeMKV");

        const result = AppConfig.makeMKVExecutable;

        expect(result).toBe(
          '"C:\\Program Files\\Custom MakeMKV\\makemkvcon.exe"'
        );
      });
    });
  });

  describe("validate method", () => {
    it("should not throw when all required paths are present", () => {
      // Using default mock values which are all valid
      expect(() => AppConfig.validate()).not.toThrow();
    });

    it("should throw when mkvDir is empty", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return "";
        if (key === "Path.movieRips.Dir") return ".\\media";
        if (key === "Path.logToFiles.Dir") return ".\\logs";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should throw when movieRipsDir is empty", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return "C:\\MakeMKV";
        if (key === "Path.movieRips.Dir") return "";
        if (key === "Path.logToFiles.Dir") return ".\\logs";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should throw when logDir is empty", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return "C:\\MakeMKV";
        if (key === "Path.movieRips.Dir") return ".\\media";
        if (key === "Path.logToFiles.Dir") return "";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should throw when multiple paths are empty", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return "";
        if (key === "Path.movieRips.Dir") return "";
        if (key === "Path.logToFiles.Dir") return ".\\logs";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should throw when paths contain only whitespace", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return "   ";
        if (key === "Path.movieRips.Dir") return ".\\media";
        if (key === "Path.logToFiles.Dir") return ".\\logs";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should throw when paths are null", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return null;
        if (key === "Path.movieRips.Dir") return ".\\media";
        if (key === "Path.logToFiles.Dir") return ".\\logs";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should throw when paths are undefined", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return undefined;
        if (key === "Path.movieRips.Dir") return ".\\media";
        if (key === "Path.logToFiles.Dir") return ".\\logs";
        return "default";
      });

      expect(() => AppConfig.validate()).toThrow(
        "Missing required configuration paths. Please check your default.json file."
      );
    });

    it("should accept valid paths with different formats", () => {
      config.get.mockImplementation((key) => {
        if (key === "Path.mkvDir.Dir") return "C:\\MakeMKV";
        if (key === "Path.movieRips.Dir") return "/home/user/movies";
        if (key === "Path.logToFiles.Dir") return "./logs/output";
        return "default";
      });

      expect(() => AppConfig.validate()).not.toThrow();
    });
  });

  describe("Integration Tests", () => {
    it("should work with real config structure", () => {
      // Reset mocks to use original implementation
      config.get.mockImplementation((key) => {
        const realConfig = {
          "Path.mkvDir.Dir": "C:\\Program Files (x86)\\MakeMKV",
          "Path.movieRips.Dir": ".\\media",
          "Path.logToFiles.Enabled": "true",
          "Path.logToFiles.Dir": ".\\logs",
          "Path.ejectDVDs.Enabled": "true",
          "Path.ripAll.Enabled": "false",
        };
        return realConfig[key];
      });

      expect(AppConfig.mkvDir).toBe("C:\\Program Files (x86)\\MakeMKV");
      expect(AppConfig.movieRipsDir).toBe(".\\media");
      expect(AppConfig.isFileLogEnabled).toBe(true);
      expect(AppConfig.logDir).toBe(".\\logs");
      expect(AppConfig.isEjectEnabled).toBe(true);
      expect(AppConfig.isRipAllEnabled).toBe(false);
      expect(AppConfig.makeMKVExecutable).toBe(
        '"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe"'
      );

      expect(() => AppConfig.validate()).not.toThrow();
    });

    it("should handle config errors gracefully", () => {
      config.get.mockImplementation(() => {
        throw new Error("Config file not found");
      });

      expect(() => AppConfig.mkvDir).toThrow("Config file not found");
    });
  });

  describe("Static Class Behavior", () => {
    it("should not allow instantiation", () => {
      expect(() => new AppConfig()).toThrow();
    });

    it("should have all methods as static", () => {
      expect(typeof AppConfig.validate).toBe("function");
      expect(Object.getOwnPropertyNames(AppConfig.prototype)).toEqual([
        "constructor",
      ]);
    });
  });
});
