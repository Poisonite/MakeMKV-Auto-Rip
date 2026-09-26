/**
 * Unit tests for the read-error recovery service (pure detection/mapping logic)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";

// Default recovery settings; individual tests may mutate this object and must
// restore it afterwards (see resetRecoveryConfig).
const DEFAULT_RECOVERY = {
  msys2Dir: "C:/msys64",
  devicePrefix: "/dev/sr",
  devicePath: "",
  workDir: "",
  keepImage: false,
  passes: 1,
  retries: 3,
  timeout: "30m",
  reversePass: true,
  direct: false,
};

// Mock config so the service's path/device helpers are deterministic.
const mockConfig = {
  AppConfig: {
    readErrorRecovery: { ...DEFAULT_RECOVERY },
  },
};
vi.mock("../../src/config/index.js", () => mockConfig);

const resetRecoveryConfig = () => {
  mockConfig.AppConfig.readErrorRecovery = { ...DEFAULT_RECOVERY };
};

// Logger is unused by the pure functions but imported by the module.
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    separator: vi.fn(),
  },
}));

// Capture spawn invocations so we can assert on the command and environment.
const spawnCalls = [];
vi.mock("child_process", () => ({
  spawn: vi.fn((file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    spawnCalls.push({ file, args, options, child });
    return child;
  }),
}));

const { RecoveryService } = await import(
  "../../src/services/recovery.service.js"
);

beforeEach(() => {
  spawnCalls.length = 0;
  resetRecoveryConfig();
});

afterEach(() => {
  resetRecoveryConfig();
});

const READ_ERROR_LOG = [
  'MSG:2003,0,3,"Error \'Scsi error - MEDIUM ERROR:L-EC UNCORRECTABLE ERROR\' occurred while reading \'/VIDEO_TS/VTS_01_1.VOB\' at offset \'3703971840\'","Error","..."',
  'MSG:5003,0,2,"Failed to save title 0 to file media\\Spider-Man 3/Spider-Man 3-G1_t00.mkv","Failed to save title %1 to file %2","0","media\\Spider-Man 3/Spider-Man 3-G1_t00.mkv"',
  'MSG:2023,131072,3,"Encountered 11 errors of type \'Read Error\'","Encountered %1 errors","11","Read Error","..."',
  'MSG:5037,516,2,"Copy complete. 10 titles saved, 1 failed.","Copy complete.","10","1"',
].join("\n");

const CLEAN_LOG = [
  'MSG:5014,131072,2,"Saving 1 titles into directory file://media","Saving","1","file://media"',
  'MSG:5036,0,1,"Copy complete. 1 titles saved.","Copy complete.","1"',
].join("\n");

describe("RecoveryService", () => {
  describe("isReadErrorFailure", () => {
    it("detects a read-error title failure", () => {
      expect(RecoveryService.isReadErrorFailure(READ_ERROR_LOG)).toBe(true);
    });

    it("returns false for a clean rip", () => {
      expect(RecoveryService.isReadErrorFailure(CLEAN_LOG)).toBe(false);
    });

    it("returns false when a title fails without read errors", () => {
      const log =
        'MSG:5003,0,2,"Failed to save title 0 to file foo_t00.mkv","Failed","0","foo_t00.mkv"';
      expect(RecoveryService.isReadErrorFailure(log)).toBe(false);
    });

    it("detects a whole-disc abort: read errors with no successful completion", () => {
      // No MSG:5003 and no "Copy complete" - the rip aborted entirely.
      const log = [
        'MSG:2003,0,3,"Error \'Scsi error\' occurred while reading \'/VIDEO_TS/VTS_01_1.VOB\'","Error","..."',
        'MSG:2023,131072,3,"Encountered 42 errors of type \'Read Error\'","Encountered %1 errors","42","Read Error"',
      ].join("\n");
      expect(RecoveryService.isReadErrorFailure(log)).toBe(true);
    });

    it("returns false when the disc had read errors but every title still saved", () => {
      const log = [
        'MSG:2003,0,3,"Error \'Scsi error\' occurred while reading","Error","..."',
        'MSG:5036,0,1,"Copy complete. 3 titles saved.","Copy complete.","3"',
      ].join("\n");
      expect(RecoveryService.isReadErrorFailure(log)).toBe(false);
    });

    it("returns false for empty or non-string input", () => {
      expect(RecoveryService.isReadErrorFailure("")).toBe(false);
      expect(RecoveryService.isReadErrorFailure(null)).toBe(false);
      expect(RecoveryService.isReadErrorFailure(undefined)).toBe(false);
    });
  });

  describe("getFailedTitleIds", () => {
    it("extracts the failed title id from the output filename", () => {
      expect(RecoveryService.getFailedTitleIds(READ_ERROR_LOG)).toEqual([0]);
    });

    it("returns unique, ascending ids for multiple failures", () => {
      const log = [
        'MSG:5003,0,2,"Failed to save title 2 to file foo_t02.mkv","x","2","foo_t02.mkv"',
        'MSG:5003,0,2,"Failed to save title 0 to file foo_t00.mkv","x","0","foo_t00.mkv"',
        'MSG:5003,0,2,"Failed to save title 0 to file foo_t00.mkv","x","0","foo_t00.mkv"',
      ].join("\n");
      expect(RecoveryService.getFailedTitleIds(log)).toEqual([0, 2]);
    });

    it("returns an empty array when nothing failed", () => {
      expect(RecoveryService.getFailedTitleIds(CLEAN_LOG)).toEqual([]);
    });
  });

  describe("mapDriveToDevice", () => {
    it("appends the drive number to the configured device prefix", () => {
      expect(RecoveryService.mapDriveToDevice("0")).toBe("/dev/sr0");
      expect(RecoveryService.mapDriveToDevice(1)).toBe("/dev/sr1");
    });

    it("uses the explicit device_path override verbatim when set", () => {
      mockConfig.AppConfig.readErrorRecovery.devicePath = "/dev/sr5";
      expect(RecoveryService.mapDriveToDevice("0")).toBe("/dev/sr5");
      expect(RecoveryService.mapDriveToDevice(2)).toBe("/dev/sr5");
    });
  });

  describe("recoverDiscToImage", () => {
    it("invokes bash with the device, image path, and tuning environment", async () => {
      mockConfig.AppConfig.readErrorRecovery = {
        ...DEFAULT_RECOVERY,
        passes: 2,
        retries: 5,
        timeout: "45m",
        reversePass: false,
        direct: true,
      };

      const promise = RecoveryService.recoverDiscToImage("0", "C:/out/img.iso");

      // The mocked spawn resolves synchronously; emit a successful close.
      expect(spawnCalls).toHaveLength(1);
      const { args, options, child } = spawnCalls[0];
      child.emit("close", 0);
      await expect(promise).resolves.toEqual({ imagePath: "C:/out/img.iso" });

      const command = args[1];
      expect(command).toContain("'/dev/sr0'");
      expect(command).toContain("'C:/out/img.iso'");
      // Retry count is passed via the environment, not the positional args.
      expect(command).not.toContain("'5'");

      expect(options.env.DDR_PASSES).toBe("2");
      expect(options.env.DDR_RETRIES).toBe("5");
      expect(options.env.DDR_TIMEOUT).toBe("45m");
      expect(options.env.DDR_REVERSE).toBe("0");
      expect(options.env.DDR_DIRECT).toBe("1");
    });

    it("single-quotes device and image paths to guard against injection", async () => {
      const promise = RecoveryService.recoverDiscToImage(
        "0",
        "C:/weird path/it's.iso"
      );
      const { args, child } = spawnCalls[0];
      child.emit("close", 0);
      await promise;
      // The apostrophe must be escaped for single-quoted bash context.
      expect(args[1]).toContain(`'C:/weird path/it'\\''s.iso'`);
    });

    it("adds an Administrator hint when ddrescue exits 4 (device unreadable)", async () => {
      const promise = RecoveryService.recoverDiscToImage("0", "C:/out/img.iso");
      spawnCalls[0].child.emit("close", 4);
      await expect(promise).rejects.toThrow(/Administrator/);
    });
  });

  describe("getBashPath", () => {
    it("builds the MSYS2 bash path from the configured root", () => {
      expect(RecoveryService.getBashPath()).toBe(
        "C:\\msys64\\usr\\bin\\bash.exe"
      );
    });
  });

  describe("parseDurationToSeconds", () => {
    it("parses h/m/s suffixes and bare seconds", () => {
      expect(RecoveryService.parseDurationToSeconds("90m")).toBe(5400);
      expect(RecoveryService.parseDurationToSeconds("2h")).toBe(7200);
      expect(RecoveryService.parseDurationToSeconds("45s")).toBe(45);
      expect(RecoveryService.parseDurationToSeconds("300")).toBe(300);
    });

    it("returns 0 for empty or invalid input", () => {
      expect(RecoveryService.parseDurationToSeconds("")).toBe(0);
      expect(RecoveryService.parseDurationToSeconds("abc")).toBe(0);
      expect(RecoveryService.parseDurationToSeconds(null)).toBe(0);
    });
  });

  describe("summarizeMapfile", () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "mar-map-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("sums rescued/bad/total bytes from block lines", () => {
      const mapPath = path.join(dir, "x.map");
      fs.writeFileSync(
        mapPath,
        [
          "# Mapfile. Created by GNU ddrescue version 1.28",
          "# Command line: ddrescue ...",
          "0x00000000     ?               1", // status line - ignored
          "0x00000000  0x00001000  +", // 4096 rescued
          "0x00001000  0x00000800  -", // 2048 bad
          "0x00001800  0x00000800  +", // 2048 rescued
        ].join("\n")
      );
      const s = RecoveryService.summarizeMapfile(mapPath);
      expect(s.rescuedBytes).toBe(6144);
      expect(s.badBytes).toBe(2048);
      expect(s.totalBytes).toBe(8192);
      expect(s.rescuedPct).toBeCloseTo(75, 5);
    });

    it("returns null for a missing or empty mapfile", () => {
      expect(RecoveryService.summarizeMapfile(path.join(dir, "nope.map"))).toBeNull();
      const empty = path.join(dir, "empty.map");
      fs.writeFileSync(empty, "# only comments\n");
      expect(RecoveryService.summarizeMapfile(empty)).toBeNull();
    });
  });

  describe("sweepStaleImages", () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "mar-sweep-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const touch = (name, ageMs) => {
      const full = path.join(dir, name);
      fs.writeFileSync(full, "x");
      const when = new Date(Date.now() - ageMs);
      fs.utimesSync(full, when, when);
    };

    it("deletes recovery artifacts older than the retention window, keeps recent ones", () => {
      const eightDays = 8 * 24 * 60 * 60 * 1000;
      touch("Old.recovery.iso", eightDays);
      touch("Old.recovery.iso.map", eightDays);
      touch("Old.recovery.iso.size", eightDays);
      touch("Fresh.recovery.iso", 60 * 1000);
      touch("movie.mkv", eightDays); // not an artifact - must be left alone

      const deleted = RecoveryService.sweepStaleImages(dir, 7);

      expect(deleted.sort()).toEqual([
        "Old.recovery.iso",
        "Old.recovery.iso.map",
        "Old.recovery.iso.size",
      ]);
      expect(fs.existsSync(path.join(dir, "Fresh.recovery.iso"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "movie.mkv"))).toBe(true);
    });

    it("is a no-op when retention is 0 or the dir is missing", () => {
      touch("Old.recovery.iso", 9 * 24 * 60 * 60 * 1000);
      expect(RecoveryService.sweepStaleImages(dir, 0)).toEqual([]);
      expect(fs.existsSync(path.join(dir, "Old.recovery.iso"))).toBe(true);
      expect(RecoveryService.sweepStaleImages(path.join(dir, "missing"), 7)).toEqual([]);
    });
  });
});
