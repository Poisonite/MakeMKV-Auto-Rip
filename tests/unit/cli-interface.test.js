/**
 * Unit tests for CLI interface
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLIInterface } from "../../src/cli/interface.js";
import { isProcessExitError } from "../../src/utils/process.js";

// Mock dependencies
vi.mock("../../src/services/rip.service.js", () => ({
  RipService: vi.fn().mockImplementation(() => ({
    startRipping: vi.fn().mockResolvedValue(undefined),
    goodVideoArray: [],
    badVideoArray: [],
  })),
}));

describe("CLIInterface", () => {
  let cliInterface;
  let consoleSpy;
  let processExitSpy;
  let mockStdin;
  let mockStdout;

  beforeEach(() => {
    // Mock console methods
    consoleSpy = {
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
    };

    // Mock process.exit
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});

    // Mock stdin and stdout
    mockStdin = {
      resume: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      pause: vi.fn(),
    };

    mockStdout = {
      write: vi.fn(),
    };

    vi.spyOn(process, "stdin", "get").mockReturnValue(mockStdin);
    vi.spyOn(process, "stdout", "get").mockReturnValue(mockStdout);

    cliInterface = new CLIInterface();

    // Ensure the ripService has the startRipping method properly mocked
    if (!cliInterface.ripService.startRipping) {
      cliInterface.ripService.startRipping = vi
        .fn()
        .mockResolvedValue(undefined);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create RipService instance", () => {
      expect(cliInterface.ripService).toBeDefined();
      expect(cliInterface.ripService.startRipping).toBeDefined();
    });
  });

  describe("displayWelcome", () => {
    it("should display all welcome messages", () => {
      cliInterface.displayWelcome();

      // Should call console multiple times for different parts of welcome message
      expect(consoleSpy.info).toHaveBeenCalled();

      // Check for specific welcome content
      const calls = consoleSpy.info.mock.calls.map((call) => call[0]);
      const allOutput = calls.join(" ");

      expect(allOutput).toContain("MakeMKV Auto Rip");
      expect(allOutput).toContain("Zac Ingoglia");
      expect(allOutput).toContain("ABSOLUTELY NO WARRANTY");
      expect(allOutput).toContain("config.yaml");
    });

    it("should display copyright information", () => {
      cliInterface.displayWelcome();

      const calls = consoleSpy.info.mock.calls.map((call) => call[0]);
      const allOutput = calls.join(" ");

      expect(allOutput).toContain("Zac Ingoglia");
    });

    it("should display configuration warning", () => {
      cliInterface.displayWelcome();

      const calls = consoleSpy.info.mock.calls.map((call) => call[0]);
      const allOutput = calls.join(" ");

      expect(allOutput).toContain("WARNING");
      expect(allOutput).toContain("config.yaml");
    });

    it("should display license information", () => {
      cliInterface.displayWelcome();

      const calls = consoleSpy.info.mock.calls.map((call) => call[0]);
      const allOutput = calls.join(" ");

      expect(allOutput).toContain("free software");
      expect(allOutput).toContain("LICENSE.md");
      expect(allOutput).toContain("README.md");
    });
  });

  describe("getPromptInput", () => {
    it("should return user input when data is received", async () => {
      const testInput = "test input";

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(testInput + "\n")), 10);
        }
      });

      const result = await cliInterface.getPromptInput("Test prompt: ");

      expect(result).toBe(testInput);
      expect(mockStdin.resume).toHaveBeenCalled();
      expect(mockStdout.write).toHaveBeenCalledWith("Test prompt: ");
      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it("should trim whitespace from input", async () => {
      const testInput = "  test input  ";

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(testInput + "\n")), 10);
        }
      });

      const result = await cliInterface.getPromptInput("Test prompt: ");

      expect(result).toBe("test input");
    });

    it("should handle empty input", async () => {
      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("\n")), 10);
        }
      });

      const result = await cliInterface.getPromptInput("Test prompt: ");

      expect(result).toBe("");
    });

    it("should reject on stdin error", async () => {
      const testError = new Error("Stdin error");

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "error") {
          setTimeout(() => callback(testError), 10);
        }
      });

      await expect(cliInterface.getPromptInput("Test prompt: ")).rejects.toBe(
        testError
      );
    });

    it("should clean up event listeners after receiving data", async () => {
      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("test\n")), 10);
        }
      });

      await cliInterface.getPromptInput("Test prompt: ");

      expect(mockStdin.off).toHaveBeenCalledWith("data", expect.any(Function));
      expect(mockStdin.off).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("should clean up event listeners after error", async () => {
      const testError = new Error("Test error");

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "error") {
          setTimeout(() => callback(testError), 10);
        }
      });

      await expect(cliInterface.getPromptInput("Test prompt: ")).rejects.toBe(
        testError
      );

      expect(mockStdin.off).toHaveBeenCalledWith("data", expect.any(Function));
      expect(mockStdin.off).toHaveBeenCalledWith("error", expect.any(Function));
    });
  });

  describe("handleUserChoice", () => {
    beforeEach(() => {
      // Mock promptUser - this helps avoid infinite recursion in tests
      vi.spyOn(cliInterface, "promptUser").mockResolvedValue(undefined);
    });

    it('should start ripping when choice is "1"', async () => {
      const startRippingSpy = vi.spyOn(cliInterface.ripService, "startRipping");

      await cliInterface.handleUserChoice("1");

      expect(startRippingSpy).toHaveBeenCalled();
      expect(cliInterface.promptUser).toHaveBeenCalled();
    });

    it('should exit when choice is "2"', async () => {
      await expect(cliInterface.handleUserChoice("2")).rejects.toThrow();

      // Check that the error is a process exit error
      try {
        await cliInterface.handleUserChoice("2");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(0);
        expect(error.message).toContain("User requested exit");
      }
    });

    it("should exit when choice is invalid", async () => {
      await expect(cliInterface.handleUserChoice("invalid")).rejects.toThrow();

      try {
        await cliInterface.handleUserChoice("invalid");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(0);
        expect(error.message).toContain("Invalid option selected");
      }
    });

    it("should exit when choice is empty", async () => {
      await expect(cliInterface.handleUserChoice("")).rejects.toThrow();

      try {
        await cliInterface.handleUserChoice("");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(0);
        expect(error.message).toContain("Invalid option selected");
      }
    });

    it("should handle numeric choices as strings", async () => {
      const startRippingSpy = vi.spyOn(cliInterface.ripService, "startRipping");

      await cliInterface.handleUserChoice("1");
      expect(startRippingSpy).toHaveBeenCalled();

      await expect(cliInterface.handleUserChoice("2")).rejects.toThrow();

      try {
        await cliInterface.handleUserChoice("2");
      } catch (error) {
        expect(isProcessExitError(error)).toBe(true);
        expect(error.exitCode).toBe(0);
      }
    });

    it("should prompt user again after successful ripping", async () => {
      const startRippingSpy = vi.spyOn(cliInterface.ripService, "startRipping");

      await cliInterface.handleUserChoice("1");

      expect(startRippingSpy).toHaveBeenCalled();
      expect(cliInterface.promptUser).toHaveBeenCalled();
    });

    it("should handle ripping service errors", async () => {
      const ripError = new Error("Ripping failed");
      vi.spyOn(cliInterface.ripService, "startRipping").mockRejectedValue(
        ripError
      );

      await expect(cliInterface.handleUserChoice("1")).rejects.toBe(ripError);
    });
  });

  describe("promptUser", () => {
    beforeEach(() => {
      vi.spyOn(cliInterface, "getPromptInput").mockResolvedValue("1");
      vi.spyOn(cliInterface, "handleUserChoice").mockResolvedValue(undefined);
    });

    it("should display prompt messages", async () => {
      await cliInterface.promptUser();

      const calls = consoleSpy.info.mock.calls.map((call) => call[0]);
      const allOutput = calls.join(" ");

      expect(allOutput).toContain("Press 1");
      expect(allOutput).toContain("Press 2");
      expect(allOutput).toContain("Rip");
      expect(allOutput).toContain("exit");
    });

    it("should get user input and handle choice", async () => {
      await cliInterface.promptUser();

      expect(cliInterface.getPromptInput).toHaveBeenCalled();
      expect(cliInterface.handleUserChoice).toHaveBeenCalledWith("1");
    });

    it("should handle different user inputs", async () => {
      vi.spyOn(cliInterface, "getPromptInput").mockResolvedValue("2");

      await cliInterface.promptUser();

      expect(cliInterface.handleUserChoice).toHaveBeenCalledWith("2");
    });

    it("should handle getPromptInput errors", async () => {
      const inputError = new Error("Input error");
      vi.spyOn(cliInterface, "getPromptInput").mockRejectedValue(inputError);

      await expect(cliInterface.promptUser()).rejects.toBe(inputError);
    });

    it("should handle handleUserChoice errors and exit", async () => {
      const choiceError = new Error("Choice error");
      vi.spyOn(cliInterface, "handleUserChoice").mockRejectedValue(choiceError);

      // In test environment, promptUser should re-throw the original error
      await expect(cliInterface.promptUser()).rejects.toThrow("Choice error");

      try {
        await cliInterface.promptUser();
      } catch (error) {
        expect(error).toBe(choiceError);
        expect(error.message).toBe("Choice error");
      }
    });
  });

  describe("start", () => {
    beforeEach(() => {
      vi.spyOn(cliInterface, "displayWelcome").mockImplementation(() => {});
      vi.spyOn(cliInterface, "promptUser").mockResolvedValue(undefined);
    });

    it("should display welcome and start prompting", async () => {
      await cliInterface.start();

      expect(cliInterface.displayWelcome).toHaveBeenCalled();
      expect(cliInterface.promptUser).toHaveBeenCalled();
    });

    it("should call displayWelcome before promptUser", async () => {
      const displayWelcomeSpy = vi.spyOn(cliInterface, "displayWelcome");
      const promptUserSpy = vi.spyOn(cliInterface, "promptUser");

      await cliInterface.start();

      expect(displayWelcomeSpy).toHaveBeenCalledBefore(promptUserSpy);
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete user interaction flow", async () => {
      // Mock the entire flow
      vi.spyOn(cliInterface, "getPromptInput")
        .mockResolvedValueOnce("1") // First choice: rip
        .mockResolvedValueOnce("2"); // Second choice: exit

      let callCount = 0;
      vi.spyOn(cliInterface, "handleUserChoice").mockImplementation(
        async (choice) => {
          callCount++;
          if (choice === "1") {
            // Simulate ripping and then prompt again
            await cliInterface.ripService.startRipping();
            if (callCount === 1) {
              await cliInterface.promptUser(); // Recursive call
            }
          } else if (choice === "2") {
            process.exit(0);
          }
        }
      );

      vi.spyOn(cliInterface, "displayWelcome").mockImplementation(() => {});

      await cliInterface.start();

      expect(cliInterface.ripService.startRipping).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it("should handle errors during startup", async () => {
      const startupError = new Error("Startup failed");
      vi.spyOn(cliInterface, "promptUser").mockRejectedValue(startupError);
      vi.spyOn(cliInterface, "displayWelcome").mockImplementation(() => {});

      await expect(cliInterface.start()).rejects.toBe(startupError);
    });
  });

  describe("Error Handling", () => {
    it("should handle stdin unavailable", async () => {
      vi.spyOn(process, "stdin", "get").mockReturnValue(null);

      await expect(cliInterface.getPromptInput("Test: ")).rejects.toThrow(
        "Standard input/output streams are not available"
      );
    });

    it("should handle stdout unavailable", async () => {
      vi.spyOn(process, "stdout", "get").mockReturnValue(null);

      await expect(cliInterface.getPromptInput("Test: ")).rejects.toThrow(
        "Standard input/output streams are not available"
      );
    });

    it("should handle malformed input data", async () => {
      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(null), 10); // null data
        }
      });

      await expect(cliInterface.getPromptInput("Test: ")).rejects.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long user input", async () => {
      const longInput = "a".repeat(1000);

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(longInput)), 10);
        }
      });

      const result = await cliInterface.getPromptInput("Test: ");
      expect(result).toBe(longInput);
    });

    it("should handle special characters in input", async () => {
      const specialInput = "!@#$%^&*()_+-=[]{}|;:,.<>?";

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(specialInput)), 10);
        }
      });

      const result = await cliInterface.getPromptInput("Test: ");
      expect(result).toBe(specialInput);
    });

    it("should handle unicode characters in input", async () => {
      const unicodeInput = "🎬 Movie Title 中文 العربية";

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(unicodeInput, "utf8")), 10);
        }
      });

      const result = await cliInterface.getPromptInput("Test: ");
      expect(result).toBe(unicodeInput);
    });

    it("should handle multiple rapid user inputs", async () => {
      let inputCount = 0;
      const inputs = ["1", "2", "3"];

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === "data") {
          const input = inputs[inputCount % inputs.length];
          inputCount++;
          setTimeout(() => callback(Buffer.from(input)), 10);
        }
      });

      const promises = inputs.map(() => cliInterface.getPromptInput("Test: "));
      const results = await Promise.all(promises);

      expect(results).toEqual(inputs);
    });
  });
});
