/**
 * Unit tests for logger utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger, colors } from "../../src/utils/logger.js";

describe("Logger and Colors", () => {
  let consoleSpy;

  beforeEach(() => {
    // Mock console methods
    consoleSpy = {
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("colors object", () => {
    it("should have all required color functions", () => {
      expect(colors).toBeDefined();
      expect(typeof colors.info).toBe("function");
      expect(typeof colors.error).toBe("function");
      expect(typeof colors.time).toBe("function");
      expect(typeof colors.dash).toBe("function");
      expect(typeof colors.title).toBe("function");
      expect(typeof colors.line1).toBe("function");
      expect(typeof colors.line2).toBe("function");
      expect(typeof colors.warning).toBe("function");
      expect(typeof colors.blue).toBe("function");
    });

    it("should have nested white color object", () => {
      expect(colors.white).toBeDefined();
      expect(typeof colors.white.underline).toBe("function");
    });

    it("should apply colors to text", () => {
      const testText = "test message";

      // Test that functions return styled strings
      expect(colors.info(testText)).toContain(testText);
      expect(colors.error(testText)).toContain(testText);
      expect(colors.time(testText)).toContain(testText);
      expect(colors.warning(testText)).toContain(testText);
    });
  });

  describe("Logger.info", () => {
    it("should log info message without title", () => {
      const message = "Test info message";

      Logger.info(message);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
    });

    it("should log info message with title", () => {
      const message = "Test info message";
      const title = "Test Title";

      Logger.info(message, title);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
      expect(call).toContain(title);
    });

    it("should include timestamp in info message", () => {
      const message = "Test message with timestamp";

      Logger.info(message);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      // Should contain time format patterns like ":" for hours:minutes:seconds
      expect(call).toMatch(/\d+:\d+:\d+/);
    });

    it("should handle empty message", () => {
      Logger.info("");

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    });

    it("should handle null title", () => {
      const message = "Test message";

      Logger.info(message, null);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
    });
  });

  describe("Logger.error", () => {
    it("should log error message without details", () => {
      const message = "Test error message";

      Logger.error(message);

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toContain(message);
    });

    it("should log error message with details", () => {
      const message = "Test error message";
      const details = "Error details here";

      Logger.error(message, details);

      expect(consoleSpy.error).toHaveBeenCalledTimes(2);

      const firstCall = consoleSpy.error.mock.calls[0][0];
      const secondCall = consoleSpy.error.mock.calls[1][0];

      expect(firstCall).toContain(message);
      expect(secondCall).toContain(details);
    });

    it("should include timestamp in error message", () => {
      const message = "Test error with timestamp";

      Logger.error(message);

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toMatch(/\d+:\d+:\d+/);
    });

    it("should handle null details", () => {
      const message = "Test error message";

      Logger.error(message, null);

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it("should handle empty details", () => {
      const message = "Test error message";

      Logger.error(message, "");

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("Logger.warning", () => {
    it("should log warning message", () => {
      const message = "Test warning message";

      Logger.warning(message);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
    });

    it("should handle empty warning message", () => {
      Logger.warning("");

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    });
  });

  describe("Logger.plain", () => {
    it("should log plain message without formatting", () => {
      const message = "Plain message";

      Logger.plain(message);

      expect(consoleSpy.info).toHaveBeenCalledWith(message);
    });

    it("should handle empty plain message", () => {
      Logger.plain("");

      expect(consoleSpy.info).toHaveBeenCalledWith("");
    });
  });

  describe("Logger.separator", () => {
    it("should log empty line as separator", () => {
      Logger.separator();

      expect(consoleSpy.info).toHaveBeenCalledWith("");
    });
  });

  describe("Logger.header", () => {
    it("should log header message with styling", () => {
      const message = "Header message";

      Logger.header(message);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
    });

    it("should handle empty header message", () => {
      Logger.header("");

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    });
  });

  describe("Logger.headerAlt", () => {
    it("should log alternative header message with styling", () => {
      const message = "Alternative header message";

      Logger.headerAlt(message);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
    });
  });

  describe("Logger.underline", () => {
    it("should log underlined message", () => {
      const message = "Underlined message";

      Logger.underline(message);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(message);
    });
  });

  describe("Integration Tests", () => {
    it("should handle multiple log calls in sequence", () => {
      Logger.header("Test Header");
      Logger.info("Test info message");
      Logger.warning("Test warning");
      Logger.error("Test error");
      Logger.separator();
      Logger.plain("Plain message");

      // Header, info, warning, separator, and plain use console.info
      expect(consoleSpy.info).toHaveBeenCalledTimes(5);
      // Error uses console.error
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it("should maintain consistent timestamp format", () => {
      Logger.info("First message");
      Logger.error("Second message");

      const infoCall = consoleSpy.info.mock.calls[0][0];
      const errorCall = consoleSpy.error.mock.calls[0][0];

      // Both should have timestamp patterns
      expect(infoCall).toMatch(/\d+:\d+:\d+/);
      expect(errorCall).toMatch(/\d+:\d+:\d+/);
    });

    it("should handle complex message formatting", () => {
      const complexMessage =
        'Message with "quotes" and special chars: @#$%^&*()';
      const complexTitle = "Title with spaces and numbers 123";

      Logger.info(complexMessage, complexTitle);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(complexMessage);
      expect(call).toContain(complexTitle);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long messages", () => {
      const longMessage = "A".repeat(1000);

      Logger.info(longMessage);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(longMessage);
    });

    it("should handle special characters in messages", () => {
      const specialMessage = '🎬 Movie: "Test" & More! ©2024';

      Logger.info(specialMessage);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain(specialMessage);
    });

    it("should handle undefined parameters gracefully", () => {
      expect(() => Logger.info(undefined)).not.toThrow();
      expect(() => Logger.error(undefined)).not.toThrow();
      expect(() => Logger.warning(undefined)).not.toThrow();
    });

    it("should handle numeric parameters", () => {
      Logger.info(123);
      Logger.error(456, 789);

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(2);
    });
  });

  describe("Time Format Functionality", () => {
    let mockAppConfig;

    beforeEach(async () => {
      // Dynamically import AppConfig for mocking
      const { AppConfig } = await import("../../src/config/index.js");
      mockAppConfig = AppConfig;
    });

    describe("12hr time format", () => {
      it("should use 12hr format when configured", () => {
        // Mock AppConfig to return 12hr format
        vi.spyOn(mockAppConfig, "logTimeFormat", "get").mockReturnValue("12hr");

        Logger.info("Test message");

        expect(consoleSpy.info).toHaveBeenCalledTimes(1);
        const call = consoleSpy.info.mock.calls[0][0];
        // Should contain AM/PM indicator for 12hr format
        expect(call).toMatch(/\d+:\d+:\d+\s(AM|PM)/i);
      });
    });

    describe("24hr time format", () => {
      it("should use 24hr format when configured", () => {
        // Mock AppConfig to return 24hr format
        vi.spyOn(mockAppConfig, "logTimeFormat", "get").mockReturnValue("24hr");

        Logger.info("Test message");

        expect(consoleSpy.info).toHaveBeenCalledTimes(1);
        const call = consoleSpy.info.mock.calls[0][0];
        // Should not contain AM/PM for 24hr format, just HH:MM:SS
        expect(call).toMatch(/\d{2}:\d{2}:\d{2}/);
        expect(call).not.toMatch(/AM|PM/i);
      });
    });

    describe("Time format consistency", () => {
      it("should apply same time format to both info and error messages", () => {
        Logger.info("Info message");
        Logger.error("Error message");

        const infoCall = consoleSpy.info.mock.calls[0][0];
        const errorCall = consoleSpy.error.mock.calls[0][0];

        // Both should have the same timestamp format pattern
        const timePattern = /\d+:\d+:\d+(\s(AM|PM))?/i;
        expect(infoCall).toMatch(timePattern);
        expect(errorCall).toMatch(timePattern);
      });

      it("should handle invalid time format gracefully", () => {
        // Mock AppConfig to return invalid format
        vi.spyOn(mockAppConfig, "logTimeFormat", "get").mockReturnValue(
          "invalid"
        );

        expect(() => Logger.info("Test message")).not.toThrow();
        expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      });
    });
  });
});
