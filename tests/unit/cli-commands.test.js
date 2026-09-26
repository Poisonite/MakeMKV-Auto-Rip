import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadDrives, ejectDrives } from "../../src/cli/commands.js";

// Mock dependencies
vi.mock("../../src/services/drive.service.js", () => ({
  DriveService: {
    loadDrivesWithWait: vi.fn(),
    ejectAllDrives: vi.fn(),
  },
}));

vi.mock("../../src/config/index.js", () => ({
  AppConfig: {
    validate: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    header: vi.fn(),
    separator: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/utils/process.js", () => ({
  safeExit: vi.fn(),
}));

vi.mock("../../src/constants/index.js", () => ({
  APP_INFO: {
    name: "MakeMKV Auto Rip",
    version: "1.0.0",
  },
}));

import { DriveService } from "../../src/services/drive.service.js";
import { AppConfig } from "../../src/config/index.js";
import { Logger } from "../../src/utils/logger.js";
import { safeExit } from "../../src/utils/process.js";

describe("CLI Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadDrives", () => {
    it("should load drives with header and messages", async () => {
      DriveService.loadDrivesWithWait.mockResolvedValue();
      AppConfig.validate.mockReturnValue();

      await loadDrives({ quiet: false });

      expect(Logger.header).toHaveBeenCalled();
      expect(Logger.separator).toHaveBeenCalled();
      expect(AppConfig.validate).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith("Loading all drives...");
      expect(DriveService.loadDrivesWithWait).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith("Load operation completed.");
      expect(safeExit).toHaveBeenCalledWith(0, "Load operation completed");
    });

    it("should suppress output when quiet flag is set", async () => {
      DriveService.loadDrivesWithWait.mockResolvedValue();
      AppConfig.validate.mockReturnValue();

      await loadDrives({ quiet: true });

      expect(Logger.header).not.toHaveBeenCalled();
      expect(Logger.separator).not.toHaveBeenCalled();
      expect(Logger.info).not.toHaveBeenCalled();
      expect(DriveService.loadDrivesWithWait).toHaveBeenCalled();
      expect(safeExit).toHaveBeenCalledWith(0, "Load operation completed");
    });

    it("should handle validation errors", async () => {
      const validationError = new Error("Invalid configuration");
      AppConfig.validate.mockImplementation(() => {
        throw validationError;
      });

      await loadDrives({ quiet: false });

      expect(Logger.error).toHaveBeenCalledWith(
        "Failed to load drives",
        "Invalid configuration"
      );
      expect(safeExit).toHaveBeenCalledWith(1, "Failed to load drives");
      expect(DriveService.loadDrivesWithWait).not.toHaveBeenCalled();
    });

    it("should handle drive service errors", async () => {
      AppConfig.validate.mockReturnValue();
      const driveError = new Error("Drive not found");
      DriveService.loadDrivesWithWait.mockRejectedValue(driveError);

      await loadDrives({ quiet: false });

      expect(Logger.error).toHaveBeenCalledWith(
        "Failed to load drives",
        "Drive not found"
      );
      expect(safeExit).toHaveBeenCalledWith(1, "Failed to load drives");
    });

    it("should use default flags when none provided", async () => {
      DriveService.loadDrivesWithWait.mockResolvedValue();
      AppConfig.validate.mockReturnValue();

      await loadDrives();

      // Default is not quiet, so header should be shown
      expect(Logger.header).toHaveBeenCalled();
    });
  });

  describe("ejectDrives", () => {
    it("should eject drives with header and messages", async () => {
      DriveService.ejectAllDrives.mockResolvedValue();
      AppConfig.validate.mockReturnValue();

      await ejectDrives({ quiet: false });

      expect(Logger.header).toHaveBeenCalled();
      expect(Logger.separator).toHaveBeenCalled();
      expect(AppConfig.validate).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith("Ejecting all drives...");
      expect(DriveService.ejectAllDrives).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith("Eject operation completed.");
      expect(safeExit).toHaveBeenCalledWith(0, "Eject operation completed");
    });

    it("should suppress output when quiet flag is set", async () => {
      DriveService.ejectAllDrives.mockResolvedValue();
      AppConfig.validate.mockReturnValue();

      await ejectDrives({ quiet: true });

      expect(Logger.header).not.toHaveBeenCalled();
      expect(Logger.separator).not.toHaveBeenCalled();
      expect(Logger.info).not.toHaveBeenCalled();
      expect(DriveService.ejectAllDrives).toHaveBeenCalled();
      expect(safeExit).toHaveBeenCalledWith(0, "Eject operation completed");
    });

    it("should handle validation errors", async () => {
      const validationError = new Error("Invalid configuration");
      AppConfig.validate.mockImplementation(() => {
        throw validationError;
      });

      await ejectDrives({ quiet: false });

      expect(Logger.error).toHaveBeenCalledWith(
        "Failed to eject drives",
        "Invalid configuration"
      );
      expect(safeExit).toHaveBeenCalledWith(1, "Failed to eject drives");
      expect(DriveService.ejectAllDrives).not.toHaveBeenCalled();
    });

    it("should handle drive service errors", async () => {
      AppConfig.validate.mockReturnValue();
      const driveError = new Error("Eject failed");
      DriveService.ejectAllDrives.mockRejectedValue(driveError);

      await ejectDrives({ quiet: false });

      expect(Logger.error).toHaveBeenCalledWith(
        "Failed to eject drives",
        "Eject failed"
      );
      expect(safeExit).toHaveBeenCalledWith(1, "Failed to eject drives");
    });

    it("should use default flags when none provided", async () => {
      DriveService.ejectAllDrives.mockResolvedValue();
      AppConfig.validate.mockReturnValue();

      await ejectDrives();

      // Default is not quiet, so header should be shown
      expect(Logger.header).toHaveBeenCalled();
    });
  });
});
