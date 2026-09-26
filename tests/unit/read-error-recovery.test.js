/**
 * Unit tests for the read-error recovery workflow: fallback-to-all,
 * resume-aware retention, concurrency lock, free-space gate, the recovery
 * time budget, and size/mtime-aware new-file detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const recoveryConfig = {
  msys2Dir: "C:/msys64",
  devicePrefix: "/dev/sr",
  devicePath: "",
  workDir: "C:/work",
  keepImage: false,
  retries: 3,
  timeout: "30m",
  maxRuntime: "90m",
  maxRuntimeRatio: 1,
  minRuntime: "10m",
  reversePass: true,
  direct: false,
  resume: true,
  imageRetentionDays: 7,
  minFreeGb: 10,
};

const mockAppConfig = {
  AppConfig: {
    isReadErrorRecoveryEnabled: true,
    isHandBrakeEnabled: false,
    isEjectDrivesEnabled: false,
    movieRipsDir: "./media",
    readErrorRecovery: recoveryConfig,
    getMakeMKVExecutable: vi.fn().mockResolvedValue("makemkvcon"),
  },
};
vi.mock("../../src/config/index.js", () => mockAppConfig);

vi.mock("../../src/utils/logger.js", () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warning: vi.fn(), error: vi.fn(), separator: vi.fn() },
}));

// FileSystemUtils.readdir returns staged listings (one per call).
const readdirResults = [];
vi.mock("../../src/utils/filesystem.js", () => ({
  FileSystemUtils: {
    readdir: vi.fn(() => Promise.resolve(readdirResults.shift() ?? [])),
    createUniqueFolder: vi.fn((p, t) => `${p}/${t}`),
    createUniqueLogFile: vi.fn(),
    writeLogFile: vi.fn(),
  },
}));

vi.mock("../../src/services/disc.service.js", () => ({ DiscService: {} }));
vi.mock("../../src/services/drive.service.js", () => ({ DriveService: {} }));
vi.mock("../../src/services/handbrake.service.js", () => ({
  HandBrakeService: { convertFile: vi.fn() },
}));
vi.mock("../../src/utils/validation.js", () => ({
  ValidationUtils: { isCopyComplete: vi.fn(() => false) },
}));
vi.mock("../../src/utils/process.js", () => ({
  safeExit: vi.fn(),
  withSystemDate: vi.fn(),
  killProcessTree: vi.fn(),
}));
vi.mock("../../src/utils/makemkv-messages.js", () => ({
  MakeMKVMessages: { checkOutput: vi.fn(() => true) },
}));

const recoveryMock = {
  isReadErrorFailure: vi.fn(() => true),
  isMediumAbsentFailure: vi.fn(() => false),
  // Mirrors the real duration parser so budget maths stays meaningful here.
  parseDurationToSeconds: vi.fn((value) => {
    const match = String(value ?? "").trim().match(/^(\d+)\s*([smh]?)$/i);
    if (!match) return 0;
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    return unit === "h" ? amount * 3600 : unit === "m" ? amount * 60 : amount;
  }),
  getFailedTitleIds: vi.fn(() => [0]),
  isAvailable: vi.fn(() => Promise.resolve(true)),
  recoverDiscToImage: vi.fn(() => Promise.resolve({ imagePath: "img" })),
  summarizeMapfile: vi.fn(() => ({
    rescuedBytes: 7_000_000_000,
    badBytes: 400_000,
    totalBytes: 7_000_400_000,
    rescuedPct: 99.99,
    badPct: 0.01,
  })),
  sweepStaleImages: vi.fn(() => []),
};
vi.mock("../../src/services/recovery.service.js", () => ({
  RecoveryService: recoveryMock,
  RecoveryProgressTracker: class {
    update() {
      return null;
    }
    finish() {
      return null;
    }
  },
  formatDuration: (seconds) => `${seconds}s`,
}));

// fs stub. Defaults: paths exist, no lock present, plenty of free space.
const fsState = { lockContent: null, statByName: {} };
const fsMock = {
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn((p) => {
    if (String(p).endsWith(".lock")) fsState.lockContent = null;
  }),
  // Atomic lock primitives: openSync("wx") throws EEXIST when a lock is present.
  openSync: vi.fn((p, flags) => {
    if (String(p).endsWith(".lock") && flags === "wx") {
      if (fsState.lockContent !== null) {
        const e = new Error("EEXIST");
        e.code = "EEXIST";
        throw e;
      }
      fsState.lockContent = "";
    }
    return 99;
  }),
  writeSync: vi.fn((fd, data) => {
    fsState.lockContent = String(data);
  }),
  closeSync: vi.fn(),
  writeFileSync: vi.fn((p, v) => {
    if (String(p).endsWith(".lock")) fsState.lockContent = String(v);
  }),
  readFileSync: vi.fn((p) => {
    if (String(p).endsWith(".lock")) {
      if (fsState.lockContent === null) {
        const e = new Error("ENOENT");
        throw e;
      }
      return fsState.lockContent;
    }
    return "";
  }),
  statSync: vi.fn((p) => {
    const name = String(p).split(/[\\/]/).pop();
    return fsState.statByName[name] ?? { size: 100, mtimeMs: 1000 };
  }),
  statfsSync: vi.fn(() => ({ bavail: 100_000_000, bsize: 4096 })), // ~381 GB free
};
vi.mock("fs", () => ({ default: fsMock, ...fsMock }));

const { ReadErrorRecovery } = await import(
  "../../src/services/read-error-recovery.js"
);

const READ_ERROR_STDOUT = [
  'MSG:5014,131072,2,"Saving 1 titles into directory file://media/Movie","Saving","1","file://media/Movie"',
  'MSG:5003,0,2,"Failed to save title 0 to file media/Movie/Movie_t00.mkv","x","0","Movie_t00.mkv"',
].join("\n");

const item = { title: "Movie", driveNumber: "0" };
const OUTPUT_FOLDER = "media/Movie";

describe("ReadErrorRecovery", () => {
  let rip;
  let cancelled;
  let queued;

  beforeEach(() => {
    vi.clearAllMocks();
    readdirResults.length = 0;
    fsState.lockContent = null;
    fsState.statByName = {};
    Object.assign(recoveryConfig, {
      workDir: "C:/work",
      keepImage: false,
      resume: true,
      imageRetentionDays: 7,
      minFreeGb: 10,
      maxRuntime: "90m",
      maxRuntimeRatio: 1,
      minRuntime: "10m",
    });
    recoveryMock.isReadErrorFailure.mockReturnValue(true);
    recoveryMock.isMediumAbsentFailure.mockReturnValue(false);
    recoveryMock.getFailedTitleIds.mockReturnValue([0]);
    recoveryMock.isAvailable.mockResolvedValue(true);
    recoveryMock.recoverDiscToImage.mockResolvedValue({ imagePath: "img" });
    recoveryMock.sweepStaleImages.mockReturnValue([]);
    mockAppConfig.AppConfig.isReadErrorRecoveryEnabled = true;
    mockAppConfig.AppConfig.isHandBrakeEnabled = false;
    cancelled = false;
    queued = [];
    rip = new ReadErrorRecovery({
      cancellation: {
        isCancelled: () => cancelled,
        createError: (message) => Object.assign(new Error(message), { isCancelled: true }),
        isCancellationError: (error) => Boolean(error?.isCancelled),
        registerProcess: () => () => {},
      },
      onRecoveredFiles: (files, folder) => queued.push({ files, folder }),
    });
    vi.spyOn(rip, "ripTitleFromImage").mockResolvedValue("ok");
  });

  afterEach(() => vi.restoreAllMocks());

  it("falls back to ripping all titles when per-title re-rip yields nothing", async () => {
    readdirResults.push([], [], ["Movie_t00.mkv"]); // snapshot, post-pertitle, post-fallback
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    const selectors = rip.ripTitleFromImage.mock.calls.map((c) => c[1]);
    expect(selectors).toEqual(["0", "all"]);
  });

  it("does not fall back when the per-title re-rip already produced a file", async () => {
    readdirResults.push([], ["Movie_t00.mkv"]);
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    const selectors = rip.ripTitleFromImage.mock.calls.map((c) => c[1]);
    expect(selectors).toEqual(["0"]);
  });

  it("keeps the image (does not unlink it) when imaging fails", async () => {
    recoveryMock.recoverDiscToImage.mockRejectedValue(new Error("read fail"));
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    expect(rip.ripTitleFromImage).not.toHaveBeenCalled();
    const unlinked = fsMock.unlinkSync.mock.calls.map((c) => String(c[0]));
    expect(unlinked.some((p) => p.endsWith(".recovery.iso"))).toBe(false);
  });

  it("skips entirely when another recovery holds the lock for this image", async () => {
    fsState.lockContent = String(process.pid); // a live PID owns the lock
    readdirResults.push([], []);
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    expect(recoveryMock.recoverDiscToImage).not.toHaveBeenCalled();
  });

  it("reclaims a stale lock whose owner process is dead", async () => {
    fsState.lockContent = "999999999"; // almost certainly not a live PID
    readdirResults.push([], ["Movie_t00.mkv"]);
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    expect(recoveryMock.recoverDiscToImage).toHaveBeenCalledOnce();
  });

  it("skips recovery when free space is below the configured minimum", async () => {
    fsMock.statfsSync.mockReturnValueOnce({ bavail: 1, bsize: 4096 }); // ~4 KB free
    readdirResults.push([], []);
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    expect(recoveryMock.recoverDiscToImage).not.toHaveBeenCalled();
  });

  it("skips recovery when the disc was removed mid-rip", async () => {
    recoveryMock.isMediumAbsentFailure.mockReturnValue(true);

    const recovered = await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });

    expect(recoveryMock.recoverDiscToImage).not.toHaveBeenCalled();
    expect(recovered).toBe(false);
  });

  describe("reported outcome", () => {
    it("reports success only when a title was actually produced", async () => {
      readdirResults.push([], ["Movie_t00.mkv"]);

      await expect(
        rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER })
      ).resolves.toBe(true);
    });

    it("reports failure when recovery produced nothing", async () => {
      readdirResults.push([], [], []); // snapshot, per-title, fallback: all empty

      await expect(
        rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER })
      ).resolves.toBe(false);
    });

    it("reports failure when recovery is disabled or unavailable", async () => {
      mockAppConfig.AppConfig.isReadErrorRecoveryEnabled = false;
      await expect(
        rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER })
      ).resolves.toBe(false);

      mockAppConfig.AppConfig.isReadErrorRecoveryEnabled = true;
      recoveryMock.isAvailable.mockResolvedValue(false);
      await expect(
        rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER })
      ).resolves.toBe(false);
    });

    it("reports failure when imaging fails", async () => {
      recoveryMock.recoverDiscToImage.mockRejectedValue(new Error("read fail"));

      await expect(
        rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER })
      ).resolves.toBe(false);
    });
  });

  describe("recovery time budget", () => {
    const budgetOf = async (ripDurationMs) => {
      readdirResults.push([], ["Movie_t00.mkv"]);
      await rip.attempt({
        stdout: READ_ERROR_STDOUT,
        disc: item,
        outputFolder: OUTPUT_FOLDER,
        ripDurationMs,
      });
      return recoveryMock.recoverDiscToImage.mock.calls.at(-1)[2]
        .maxRuntimeSeconds;
    };

    it("budgets one rip's worth of imaging time", async () => {
      // 20 minute rip -> 20 minutes of imaging, so the disc costs ~2x overall.
      expect(await budgetOf(20 * 60 * 1000)).toBe(1200);
    });

    it("honours the ratio", async () => {
      recoveryConfig.maxRuntimeRatio = 0.5;
      expect(await budgetOf(20 * 60 * 1000)).toBe(600);
    });

    it("never drops below min_runtime", async () => {
      // A rip that died after 30 seconds still gets a usable attempt.
      expect(await budgetOf(30 * 1000)).toBe(600);
    });

    it("never exceeds the absolute max_runtime ceiling", async () => {
      expect(await budgetOf(4 * 60 * 60 * 1000)).toBe(5400);
    });
  });

  it("sweeps stale images before starting", async () => {
    readdirResults.push([], ["Movie_t00.mkv"]);
    await rip.attempt({ stdout: READ_ERROR_STDOUT, disc: item, outputFolder: OUTPUT_FOLDER });
    expect(recoveryMock.sweepStaleImages).toHaveBeenCalledWith("C:/work", 7);
  });

  describe("collectRecoveredMkvs", () => {
    it("treats a same-named MKV whose size/mtime changed as recovered", async () => {
      fsState.statByName["Movie_t00.mkv"] = { size: 100, mtimeMs: 1000 };
      readdirResults.push(["Movie_t00.mkv"]); // snapshot
      const before = await rip.snapshotMkvs("dir");
      // The failed partial is overwritten by a larger, newer recovered file.
      fsState.statByName["Movie_t00.mkv"] = { size: 999, mtimeMs: 5000 };
      readdirResults.push(["Movie_t00.mkv"]);
      const recovered = await rip.collectRecoveredMkvs("dir", before);
      expect(recovered).toEqual(["Movie_t00.mkv"]);
    });

    it("ignores an unchanged file", async () => {
      fsState.statByName["keep.mkv"] = { size: 100, mtimeMs: 1000 };
      readdirResults.push(["keep.mkv"]);
      const before = await rip.snapshotMkvs("dir");
      readdirResults.push(["keep.mkv"]);
      const recovered = await rip.collectRecoveredMkvs("dir", before);
      expect(recovered).toEqual([]);
    });
  });

  describe("cleanupArtifacts", () => {
    it("deletes image+map on a clean success", () => {
      rip.cleanupArtifacts("a.iso", "a.iso.map", {
        keepImage: false,
        producedFiles: true,
        hasBadSectors: false,
      });
      const unlinked = fsMock.unlinkSync.mock.calls.map((c) => String(c[0]));
      expect(unlinked).toContain("a.iso");
      expect(unlinked).toContain("a.iso.map");
    });

    it("keeps image+map when nothing was produced but bad sectors remain", () => {
      rip.cleanupArtifacts("a.iso", "a.iso.map", {
        keepImage: false,
        producedFiles: false,
        hasBadSectors: true,
      });
      expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    });

    it("keeps image when keep_image is set", () => {
      rip.cleanupArtifacts("a.iso", "a.iso.map", {
        keepImage: true,
        producedFiles: true,
        hasBadSectors: false,
      });
      expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
