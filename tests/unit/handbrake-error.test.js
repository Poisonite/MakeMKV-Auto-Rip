import { describe, it, expect } from "vitest";
import { HandBrakeError, HandBrakeService } from "../../src/services/handbrake.service.js";

describe("HandBrakeError", () => {
    it("should create error with message", () => {
        const error = new HandBrakeError("Test error message");
        expect(error.message).toBe("Test error message");
        expect(error.name).toBe("HandBrakeError");
        expect(error.details).toBeNull();
    });

    it("should create error with message and details", () => {
        const error = new HandBrakeError("Main message", "Additional details");
        expect(error.message).toBe("Main message");
        expect(error.details).toBe("Additional details");
        expect(error.name).toBe("HandBrakeError");
    });

    it("should be throwable and catchable", () => {
        expect(() => {
            throw new HandBrakeError("Test error");
        }).toThrow(HandBrakeError);

        try {
            throw new HandBrakeError("Test", "Details");
        } catch (error) {
            expect(error).toBeInstanceOf(HandBrakeError);
            expect(error.message).toBe("Test");
            expect(error.details).toBe("Details");
        }
    });

    it("should be instance of Error", () => {
        const error = new HandBrakeError("Test");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(HandBrakeError);
    });

    it("should have error stack trace", () => {
        const error = new HandBrakeError("Test");
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain("HandBrakeError");
    });
});

describe("validateConfig with HandBrakeError", () => {
    it("should throw HandBrakeError for missing config", () => {
        expect(() => {
            HandBrakeService.validateConfig(null);
        }).toThrow(HandBrakeError);

        expect(() => {
            HandBrakeService.validateConfig(null);
        }).toThrow(/configuration is missing or invalid/i);
    });

    it("should throw HandBrakeError for invalid output format", () => {
        const config = { enabled: true, output_format: "invalid", preset: "Fast 1080p30" };
        expect(() => {
            HandBrakeService.validateConfig(config);
        }).toThrow(HandBrakeError);
    });

    it("should throw HandBrakeError for missing preset", () => {
        const config = { enabled: true, output_format: "mp4", preset: "" };
        expect(() => {
            HandBrakeService.validateConfig(config);
        }).toThrow(HandBrakeError);
    });

    it("should throw HandBrakeError with details for empty preset", () => {
        const config = { enabled: true, output_format: "mp4", preset: "   " };
        try {
            HandBrakeService.validateConfig(config);
            expect.fail("Should have thrown HandBrakeError");
        } catch (error) {
            expect(error).toBeInstanceOf(HandBrakeError);
            expect(error.details).toBeDefined();
        }
    });

    it("should throw HandBrakeError for conflicting additional args", () => {
        const config = {
            enabled: true,
            output_format: "mp4",
            preset: "Fast 1080p30",
            additional_args: "--input test.mkv"
        };
        expect(() => {
            HandBrakeService.validateConfig(config);
        }).toThrow(HandBrakeError);

        expect(() => {
            HandBrakeService.validateConfig(config);
        }).toThrow(/conflicting/i);
    });

    it("should pass validation for valid config", () => {
        const config = {
            enabled: true,
            output_format: "mp4",
            preset: "Fast 1080p30",
            additional_args: "--quality 22"
        };
        expect(() => {
            HandBrakeService.validateConfig(config);
        }).not.toThrow();
    });

    it("should pass validation for m4v format", () => {
        const config = {
            enabled: true,
            output_format: "m4v",
            preset: "Fast 1080p30"
        };
        expect(() => {
            HandBrakeService.validateConfig(config);
        }).not.toThrow();
    });
});

describe("sanitizePath security", () => {
    it("should remove null bytes", () => {
        const input = "test\x00file\x00path";
        const result = HandBrakeService.sanitizePath(input);
        expect(result).not.toContain("\x00");
        expect(result).toBe("testfilepath");
    });

    it("should remove control characters", () => {
        const input = "test\x01file\x1Fpath\x7F";
        const result = HandBrakeService.sanitizePath(input);
        expect(result).not.toContain("\x01");
        expect(result).not.toContain("\x1F");
        expect(result).not.toContain("\x7F");
    });

    it("should detect path traversal with ..", () => {
        expect(() => {
            HandBrakeService.sanitizePath("/test/../../../etc/passwd");
        }).toThrow(HandBrakeError);

        expect(() => {
            HandBrakeService.sanitizePath("..\\..\\windows\\system32");
        }).toThrow(/path traversal/i);
    });

    it("should escape quotes", () => {
        const input = 'test"file"path';
        const result = HandBrakeService.sanitizePath(input);
        expect(result).toBe('test"file"path');
    });

    it("should escape backslashes", () => {
        const input = 'test\\file\\path';
        const result = HandBrakeService.sanitizePath(input);
        expect(result).toBe('test\\file\\path');
    });

    it("should handle paths with spaces", () => {
        const input = "test file path";
        const result = HandBrakeService.sanitizePath(input);
        expect(result).toContain(" ");
        expect(result).toBe("test file path");
    });

    it("should preserve path separators", () => {
        const input = "test/file/path";
        const result = HandBrakeService.sanitizePath(input);
        // Should preserve forward slashes (HandBrake accepts them on all platforms)
        expect(result).toBe("test/file/path");
    });
});
