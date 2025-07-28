import { describe, it, expect, vi } from "vitest";
import { MakeMKVMessages } from "../../src/utils/makemkv-messages.js";
import { MAKEMKV_VERSION_MESSAGES } from "../../src/constants/index.js";

// Mock the Logger to avoid config file dependencies
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("MakeMKVMessages", () => {
  describe("checkOutput", () => {
    it("should return true for empty output", () => {
      const result = MakeMKVMessages.checkOutput("");
      expect(result).toBe(true);
    });

    it("should return true for null/undefined output", () => {
      const result = MakeMKVMessages.checkOutput(null);
      expect(result).toBe(true);
    });

    it("should return false when version is too old", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.VERSION_TOO_OLD},0,1,"Version too old"\nMore output`;
      const result = MakeMKVMessages.checkOutput(output, false);
      expect(result).toBe(false);
    });

    it("should return true when version is too old but it's not first call", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.VERSION_INFO},0,1,"MakeMKV v1.18.1 linux(x64-release) started","%1 started","MakeMKV v1.18.1 linux(x64-release)"\nMore output`;
      const result = MakeMKVMessages.checkOutput(output, false);
      expect(result).toBe(true);
    });

    it("should handle version info on first call", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.VERSION_INFO},0,1,"MakeMKV v1.18.1 linux(x64-release) started","%1 started","MakeMKV v1.18.1 linux(x64-release)"\nMore output`;
      const result = MakeMKVMessages.checkOutput(output, true);
      expect(result).toBe(true);
    });

    it("should handle update available on first call", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.UPDATE_AVAILABLE},0,1,"Update available"\nMore output`;
      const result = MakeMKVMessages.checkOutput(output, true);
      expect(result).toBe(true);
    });

    it("should ignore update available on non-first call", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.UPDATE_AVAILABLE},0,1,"Update available"\nMore output`;
      const result = MakeMKVMessages.checkOutput(output, false);
      expect(result).toBe(true);
    });
  });

  describe("hasCriticalErrors", () => {
    it("should return false for empty output", () => {
      const result = MakeMKVMessages.hasCriticalErrors("");
      expect(result).toBe(false);
    });

    it("should return true when version is too old", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.VERSION_TOO_OLD},0,1,"Version too old"\nMore output`;
      const result = MakeMKVMessages.hasCriticalErrors(output);
      expect(result).toBe(true);
    });

    it("should return false for normal output", () => {
      const output = `Some output\n${MAKEMKV_VERSION_MESSAGES.VERSION_INFO},0,1,"MakeMKV v1.18.1 linux(x64-release) started","%1 started","MakeMKV v1.18.1 linux(x64-release)"\nMore output`;
      const result = MakeMKVMessages.hasCriticalErrors(output);
      expect(result).toBe(false);
    });
  });
});
