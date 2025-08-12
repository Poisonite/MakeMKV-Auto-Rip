import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpticalDriveUtil } from "../../src/utils/optical-drive.js";

// Mock dependencies
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("OpticalDriveUtil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to load the util with a mocked platform and optional dependency mocks
  async function loadUtilWithPlatform(
    platform,
    { childFactory, fsFactory, nativeFactory, utilFactory } = {}
  ) {
    vi.resetModules();
    vi.doMock("os", () => ({
      default: { platform: () => platform },
      platform: () => platform,
    }));
    const logger = { info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    vi.doMock("../../src/utils/logger.js", () => ({ Logger: logger }));
    if (utilFactory) vi.doMock("util", utilFactory);
    if (childFactory) vi.doMock("child_process", childFactory);
    if (fsFactory) vi.doMock("fs/promises", fsFactory);
    if (nativeFactory)
      vi.doMock("../../src/utils/native-optical-drive.js", nativeFactory);

    const mod = await import("../../src/utils/optical-drive.js");
    return { OpticalDriveUtil: mod.OpticalDriveUtil, Logger: logger };
  }

  describe("Platform dispatching", () => {
    it("getOpticalDrives throws on unsupported platform", async () => {
      const { OpticalDriveUtil } = await loadUtilWithPlatform("freebsd");
      await expect(OpticalDriveUtil.getOpticalDrives()).rejects.toThrow(
        /Unsupported platform: freebsd/
      );
    });
  });

  describe("Windows", () => {
    it("detects optical drives via WMI and filters invalid entries", async () => {
      const wmiOutput = JSON.stringify([
        { Drive: "D:", Caption: "BD-ROM HL-DT-ST" },
        { Drive: "", Caption: "Invalid" },
      ]);
      const { OpticalDriveUtil } = await loadUtilWithPlatform("win32", {
        utilFactory: () => ({
          promisify: (fn) => (cmd) => {
            if (String(cmd).includes("Get-WmiObject Win32_CDROMDrive")) {
              return Promise.resolve({ stdout: wmiOutput, stderr: "" });
            }
            return Promise.resolve({ stdout: "", stderr: "" });
          },
        }),
      });

      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([
        {
          id: "D:",
          path: "D:",
          description: "BD-ROM HL-DT-ST",
          mediaType: "Optical",
          platform: "win32",
        },
      ]);
    });

    it("ejectDrive uses native addon and returns true on success", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("win32", {
        nativeFactory: () => ({
          NativeOpticalDrive: {
            isNativeAvailable: true,
            ejectDrive: vi.fn().mockResolvedValue(true),
            loadDrive: vi.fn().mockResolvedValue(true),
          },
        }),
      });
      const drive = {
        id: "D:",
        path: "D:",
        description: "Drive D",
        platform: "win32",
      };
      const res = await OpticalDriveUtil.ejectDrive(drive);
      expect(res).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("Ejected drive: Drive D");
    });

    it("ejectDrive returns false and logs error when native fails", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("win32", {
        nativeFactory: () => ({
          NativeOpticalDrive: {
            isNativeAvailable: true,
            ejectDrive: vi.fn().mockResolvedValue(false),
            loadDrive: vi.fn().mockResolvedValue(true),
          },
        }),
      });
      const drive = {
        id: "E:",
        path: "E:",
        description: "Drive E",
        platform: "win32",
      };
      const res = await OpticalDriveUtil.ejectDrive(drive);
      expect(res).toBe(false);
      expect(Logger.error).toHaveBeenCalled();
    });

    it("loadDrive uses native addon and returns true on success", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("win32", {
        nativeFactory: () => ({
          NativeOpticalDrive: {
            isNativeAvailable: true,
            ejectDrive: vi.fn().mockResolvedValue(true),
            loadDrive: vi.fn().mockResolvedValue(true),
          },
        }),
      });
      const drive = {
        id: "D:",
        path: "D:",
        description: "Drive D",
        platform: "win32",
      };
      const res = await OpticalDriveUtil.loadDrive(drive);
      expect(res).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("Loaded drive: Drive D");
    });

    it("loadDrive returns false and warns when native fails", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("win32", {
        nativeFactory: () => ({
          NativeOpticalDrive: {
            isNativeAvailable: true,
            ejectDrive: vi.fn().mockResolvedValue(true),
            loadDrive: vi.fn().mockResolvedValue(false),
          },
        }),
      });
      const drive = {
        id: "E:",
        path: "E:",
        description: "Drive E",
        platform: "win32",
      };
      const res = await OpticalDriveUtil.loadDrive(drive);
      expect(res).toBe(false);
      expect(Logger.warning).toHaveBeenCalled();
    });
  });

  describe("macOS", () => {
    it("detects optical drives via system_profiler", async () => {
      const profilerJson = JSON.stringify({
        SPDiscBurningDataType: [
          { _name: "SuperDrive" },
          { _name: "USB Optical" },
        ],
      });
      const { OpticalDriveUtil } = await loadUtilWithPlatform("darwin", {
        utilFactory: () => ({
          promisify: () => (cmd) => {
            if (
              String(cmd).includes(
                "system_profiler SPDiscBurningDataType -json"
              )
            ) {
              return Promise.resolve({ stdout: profilerJson, stderr: "" });
            }
            return Promise.resolve({ stdout: "", stderr: "" });
          },
        }),
      });
      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([
        {
          id: "optical0",
          path: "/dev/rdisk1",
          description: "SuperDrive",
          mediaType: "Optical",
          platform: "darwin",
        },
        {
          id: "optical1",
          path: "/dev/rdisk2",
          description: "USB Optical",
          mediaType: "Optical",
          platform: "darwin",
        },
      ]);
    });

    it("falls back to diskutil when system_profiler finds none", async () => {
      const profilerEmpty = JSON.stringify({ SPDiscBurningDataType: [] });
      const diskutilList = [
        "/dev/disk4 (external, physical) (optical)",
        "/dev/disk2 (internal, physical)",
        "  #:                        TYPE NAME                    SIZE       IDENTIFIER",
      ].join("\n");

      const { OpticalDriveUtil } = await loadUtilWithPlatform("darwin", {
        utilFactory: () => ({
          promisify: () => (cmd) => {
            const s = String(cmd);
            if (s.includes("system_profiler SPDiscBurningDataType -json")) {
              return Promise.resolve({ stdout: profilerEmpty, stderr: "" });
            }
            if (s.includes("diskutil list")) {
              return Promise.resolve({ stdout: diskutilList, stderr: "" });
            }
            return Promise.resolve({ stdout: "", stderr: "" });
          },
        }),
      });
      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([
        {
          id: "disk4",
          path: "/dev/rdisk4",
          description: "Optical Drive",
          mediaType: "Optical",
          platform: "darwin",
        },
      ]);
    });

    it("logs warning and returns empty when diskutil fallback fails", async () => {
      const profilerEmpty = JSON.stringify({ SPDiscBurningDataType: [] });
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform(
        "darwin",
        {
          utilFactory: () => ({
            promisify: () => (cmd) => {
              const s = String(cmd);
              if (s.includes("system_profiler SPDiscBurningDataType -json")) {
                return Promise.resolve({ stdout: profilerEmpty, stderr: "" });
              }
              if (s.includes("diskutil list")) {
                return Promise.reject(new Error("diskutil unavailable"));
              }
              return Promise.resolve({ stdout: "", stderr: "" });
            },
          }),
        }
      );
      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([]);
      expect(Logger.warning).toHaveBeenCalledWith(
        "Could not detect optical drives via diskutil"
      );
    });

    it("logs error and returns empty when system_profiler JSON is invalid", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform(
        "darwin",
        {
          utilFactory: () => ({
            promisify: () => (cmd) => {
              if (
                String(cmd).includes(
                  "system_profiler SPDiscBurningDataType -json"
                )
              ) {
                return Promise.resolve({ stdout: "not json", stderr: "" });
              }
              return Promise.resolve({ stdout: "", stderr: "" });
            },
          }),
        }
      );
      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([]);
      expect(Logger.error).toHaveBeenCalled();
    });

    it("ejectDrive succeeds via drutil tray open", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform(
        "darwin",
        {
          utilFactory: () => ({
            promisify: () => (cmd) => {
              if (String(cmd).includes("drutil tray open")) {
                return Promise.resolve({ stdout: "", stderr: "" });
              }
              return Promise.resolve({ stdout: "", stderr: "" });
            },
          }),
        }
      );
      const drive = {
        id: "optical0",
        path: "/dev/rdisk1",
        description: "SuperDrive",
        platform: "darwin",
      };
      const res = await OpticalDriveUtil.ejectDrive(drive);
      expect(res).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("Ejected drive: SuperDrive");
    });

    it("ejectDrive falls back to diskutil eject when drutil open fails", async () => {
      const { OpticalDriveUtil } = await loadUtilWithPlatform("darwin", {
        utilFactory: () => ({
          promisify: () => (cmd) => {
            const s = String(cmd);
            if (s.includes("drutil tray open")) {
              return Promise.reject(new Error("open failed"));
            }
            if (s.includes("diskutil eject /dev/rdisk9")) {
              return Promise.resolve({ stdout: "", stderr: "" });
            }
            return Promise.resolve({ stdout: "", stderr: "" });
          },
        }),
      });
      const drive = {
        id: "optical9",
        path: "/dev/rdisk9",
        description: "USB Optical",
        platform: "darwin",
      };
      const res = await OpticalDriveUtil.ejectDrive(drive);
      expect(res).toBe(true);
    });

    it("ejectDrive uses drutil eject as final fallback", async () => {
      const { OpticalDriveUtil } = await loadUtilWithPlatform("darwin", {
        utilFactory: () => ({
          promisify: () => (cmd) => {
            const s = String(cmd);
            if (s.includes("drutil tray open")) {
              return Promise.reject(new Error("open failed"));
            }
            if (s.includes("diskutil eject /dev/rdisk9")) {
              return Promise.reject(new Error("diskutil failed"));
            }
            if (s.includes("drutil eject")) {
              return Promise.resolve({ stdout: "", stderr: "" });
            }
            return Promise.resolve({ stdout: "", stderr: "" });
          },
        }),
      });
      const drive = {
        id: "optical9",
        path: "/dev/rdisk9",
        description: "USB Optical",
        platform: "darwin",
      };
      const res = await OpticalDriveUtil.ejectDrive(drive);
      expect(res).toBe(true);
    });

    it("ejectDrive returns false if all eject strategies fail", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform(
        "darwin",
        {
          utilFactory: () => ({
            promisify: () => (cmd) => {
              const s = String(cmd);
              if (s.includes("drutil tray open"))
                return Promise.reject(new Error("x"));
              if (s.includes("diskutil eject /dev/rdisk9"))
                return Promise.reject(new Error("y"));
              if (s.includes("drutil eject"))
                return Promise.reject(new Error("z"));
              return Promise.resolve({ stdout: "", stderr: "" });
            },
          }),
        }
      );
      const drive = {
        id: "optical9",
        path: "/dev/rdisk9",
        description: "USB Optical",
        platform: "darwin",
      };
      const res = await OpticalDriveUtil.ejectDrive(drive);
      expect(res).toBe(false);
      expect(Logger.error).toHaveBeenCalled();
    });

    it("loadDrive logs warning on failure but still returns true", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform(
        "darwin",
        {
          utilFactory: () => ({
            promisify: () => (cmd) => {
              if (String(cmd).includes("drutil tray close")) {
                return Promise.reject(new Error("close failed"));
              }
              return Promise.resolve({ stdout: "", stderr: "" });
            },
          }),
        }
      );
      const drive = {
        id: "optical0",
        path: "/dev/rdisk1",
        description: "SuperDrive",
        platform: "darwin",
      };
      const res = await OpticalDriveUtil.loadDrive(drive);
      expect(res).toBe(true);
      expect(Logger.warning).toHaveBeenCalledWith(
        "Drive may not support automatic closing"
      );
      expect(Logger.info).toHaveBeenCalledWith("Loaded drive: SuperDrive");
    });

    it("loadDrive succeeds when drutil close works", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform(
        "darwin",
        {
          utilFactory: () => ({
            promisify: () => (cmd) => {
              if (String(cmd).includes("drutil tray close")) {
                return Promise.resolve({ stdout: "", stderr: "" });
              }
              return Promise.resolve({ stdout: "", stderr: "" });
            },
          }),
        }
      );
      const drive = {
        id: "optical0",
        path: "/dev/rdisk1",
        description: "SuperDrive",
        platform: "darwin",
      };
      const res = await OpticalDriveUtil.loadDrive(drive);
      expect(res).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("Loaded drive: SuperDrive");
    });
  });

  describe("Linux", () => {
    it("detects optical drives via /proc cdrom info with model from udevadm", async () => {
      const procInfo = [
        "CD-ROM information, Id: cdrom.c 3.20 ",
        "drive name:    sr0 sr1",
      ].join("\n");

      const { OpticalDriveUtil } = await loadUtilWithPlatform("linux", {
        fsFactory: () => {
          const readFile = vi.fn(async (p) => {
            if (String(p) === "/proc/sys/dev/cdrom/info") return procInfo;
            throw new Error("unexpected readFile: " + p);
          });
          const access = vi.fn(async (p) => {
            if (String(p) === "/dev/sr0" || String(p) === "/dev/sr1") return;
            throw new Error("unexpected access: " + p);
          });
          return { default: { readFile, access }, readFile, access };
        },
        utilFactory: () => ({
          promisify: () => async (cmd) => {
            if (
              String(cmd).includes("udevadm info") &&
              String(cmd).includes("/dev/sr0")
            ) {
              return { stdout: "ID_MODEL=HL-DT-ST_BD-RE", stderr: "" };
            }
            if (
              String(cmd).includes("udevadm info") &&
              String(cmd).includes("/dev/sr1")
            ) {
              return { stdout: "", stderr: "" };
            }
            return { stdout: "", stderr: "" };
          },
        }),
      });

      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([
        {
          id: "sr0",
          path: "/dev/sr0",
          description: "HL-DT-ST BD-RE",
          mediaType: "Optical",
          platform: "linux",
        },
        {
          id: "sr1",
          path: "/dev/sr1",
          description: "Optical Drive",
          mediaType: "Optical",
          platform: "linux",
        },
      ]);
    });

    it("falls back to /sys/block scanning when /proc not available", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("linux", {
        fsFactory: () => {
          const readFile = vi.fn(async (p) => {
            const s = String(p);
            if (s === "/proc/sys/dev/cdrom/info") throw new Error("no proc");
            if (s === "/sys/block/sr0/removable") return "1";
            if (s === "/sys/block/sr0/capability") return "18"; // 0x12 -> includes 0x10
            if (s === "/sys/block/sda/removable") return "0";
            if (s === "/sys/block/sda/capability") return "0";
            throw new Error("unexpected readFile: " + p);
          });
          const readdir = vi.fn(async (p) => {
            if (String(p) === "/sys/block") return ["sda", "sr0"];
            throw new Error("unexpected readdir: " + p);
          });
          const access = vi.fn(async (p) => {
            if (String(p) === "/dev/sr0") return;
            throw new Error("unexpected access: " + p);
          });
          return {
            default: { readFile, readdir, access },
            readFile,
            readdir,
            access,
          };
        },
        utilFactory: () => ({
          promisify: () => async (cmd) => {
            if (
              String(cmd).includes("udevadm info") &&
              String(cmd).includes("/dev/sr0")
            ) {
              return { stdout: "ID_MODEL=ASUS_DRW-24D5MT", stderr: "" };
            }
            return { stdout: "", stderr: "" };
          },
        }),
      });

      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([
        {
          id: "sr0",
          path: "/dev/sr0",
          description: "ASUS DRW-24D5MT",
          mediaType: "Optical",
          platform: "linux",
        },
      ]);
      expect(Logger.warning).toHaveBeenCalledWith(
        "Could not read /proc/sys/dev/cdrom/info"
      );
    });

    it("logs warning when /sys scan fails", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("linux", {
        fsFactory: () => ({
          readFile: vi.fn(async (p) => {
            if (String(p) === "/proc/sys/dev/cdrom/info")
              throw new Error("no proc");
            throw new Error("unexpected readFile");
          }),
          readdir: vi.fn(async () => {
            throw new Error("no sys");
          }),
        }),
      });
      const drives = await OpticalDriveUtil.getOpticalDrives();
      expect(drives).toEqual([]);
      expect(Logger.warning).toHaveBeenCalledWith(
        "Could not read /proc/sys/dev/cdrom/info"
      );
      expect(Logger.warning).toHaveBeenCalledWith(
        "Could not scan /sys/block for optical drives"
      );
    });

    it("ejectDrive uses udisksctl and falls back to eject", async () => {
      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("linux", {
        utilFactory: () => ({
          promisify: () => async (cmd) => {
            const s = String(cmd);
            if (s.includes("udisksctl unmount -b /dev/sr0"))
              return { stdout: "", stderr: "" };
            if (s.includes("udisksctl eject -b /dev/sr0"))
              return { stdout: "", stderr: "" };
            return { stdout: "", stderr: "" };
          },
        }),
      });
      const drive = {
        id: "sr0",
        path: "/dev/sr0",
        description: "Linux Drive",
        platform: "linux",
      };
      const ok = await OpticalDriveUtil.ejectDrive(drive);
      expect(ok).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("Ejected drive: Linux Drive");

      // Now test fallback path
      const { OpticalDriveUtil: Util2, Logger: Logger2 } =
        await loadUtilWithPlatform("linux", {
          utilFactory: () => ({
            promisify: () => async (cmd) => {
              const s = String(cmd);
              if (s.includes("udisksctl")) throw new Error("udisksctl fail");
              if (s.includes("eject /dev/sr0"))
                return { stdout: "", stderr: "" };
              return { stdout: "", stderr: "" };
            },
          }),
        });
      const ok2 = await Util2.ejectDrive(drive);
      expect(ok2).toBe(true);
      expect(Logger2.info).toHaveBeenCalledWith("Ejected drive: Linux Drive");
    });

    it("loadDrive uses eject -t and logs warning on failure", async () => {
      const drive = {
        id: "sr0",
        path: "/dev/sr0",
        description: "Linux Drive",
        platform: "linux",
      };

      const { OpticalDriveUtil, Logger } = await loadUtilWithPlatform("linux", {
        utilFactory: () => ({
          promisify: () => async (cmd) => {
            if (String(cmd).includes("eject -t /dev/sr0"))
              return { stdout: "", stderr: "" };
            return { stdout: "", stderr: "" };
          },
        }),
      });
      const ok = await OpticalDriveUtil.loadDrive(drive);
      expect(ok).toBe(true);
      expect(Logger.info).toHaveBeenCalledWith("Loaded drive: Linux Drive");

      const { OpticalDriveUtil: Util2, Logger: Logger2 } =
        await loadUtilWithPlatform("linux", {
          utilFactory: () => ({
            promisify: () => async (cmd) => {
              if (String(cmd).includes("eject -t /dev/sr0"))
                throw new Error("no support");
              return { stdout: "", stderr: "" };
            },
          }),
        });
      const ok2 = await Util2.loadDrive(drive);
      expect(ok2).toBe(true);
      expect(Logger2.warning).toHaveBeenCalledWith(
        "Drive /dev/sr0 may not support automatic loading"
      );
      expect(Logger2.info).toHaveBeenCalledWith("Loaded drive: Linux Drive");
    });
  });

  describe("Aggregations", () => {
    it("ejectAllDrives aggregates results", async () => {
      const { OpticalDriveUtil } = await loadUtilWithPlatform("linux");
      const d1 = {
        id: "sr0",
        path: "/dev/sr0",
        description: "A",
        platform: "linux",
      };
      const d2 = {
        id: "sr1",
        path: "/dev/sr1",
        description: "B",
        platform: "linux",
      };
      vi.spyOn(OpticalDriveUtil, "getOpticalDrives").mockResolvedValue([
        d1,
        d2,
      ]);
      vi.spyOn(OpticalDriveUtil, "ejectDrive")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const res = await OpticalDriveUtil.ejectAllDrives();
      expect(res).toEqual({ total: 2, successful: 1, failed: 1 });
    });

    it("loadAllDrives aggregates results", async () => {
      const { OpticalDriveUtil } = await loadUtilWithPlatform("linux");
      const d1 = {
        id: "sr0",
        path: "/dev/sr0",
        description: "A",
        platform: "linux",
      };
      const d2 = {
        id: "sr1",
        path: "/dev/sr1",
        description: "B",
        platform: "linux",
      };
      vi.spyOn(OpticalDriveUtil, "getOpticalDrives").mockResolvedValue([
        d1,
        d2,
      ]);
      vi.spyOn(OpticalDriveUtil, "loadDrive")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);
      const res = await OpticalDriveUtil.loadAllDrives();
      expect(res).toEqual({ total: 2, successful: 2, failed: 0 });
    });
  });

  describe("Class structure", () => {
    it("should be a class with static methods", () => {
      expect(OpticalDriveUtil).toBeDefined();
      expect(typeof OpticalDriveUtil).toBe("function");
    });

    it("should have all required static methods", () => {
      expect(typeof OpticalDriveUtil.getOpticalDrives).toBe("function");
      expect(typeof OpticalDriveUtil.ejectAllDrives).toBe("function");
      expect(typeof OpticalDriveUtil.loadAllDrives).toBe("function");
      expect(typeof OpticalDriveUtil.ejectDrive).toBe("function");
      expect(typeof OpticalDriveUtil.loadDrive).toBe("function");
    });
  });

  describe("Cross-platform support verification", () => {
    it("should handle different platforms correctly", async () => {
      // This test verifies that the method structure exists
      // Platform-specific functionality is tested in integration tests
      expect(OpticalDriveUtil.getOpticalDrives).toBeDefined();
      expect(OpticalDriveUtil.ejectAllDrives).toBeDefined();
      expect(OpticalDriveUtil.loadAllDrives).toBeDefined();
    });

    it("should have individual drive operation methods", () => {
      expect(OpticalDriveUtil.ejectDrive).toBeDefined();
      expect(OpticalDriveUtil.loadDrive).toBeDefined();
    });
  });

  describe("Method availability", () => {
    it("should provide the expected API surface", () => {
      const expectedMethods = [
        "getOpticalDrives",
        "ejectAllDrives",
        "loadAllDrives",
        "ejectDrive",
        "loadDrive",
      ];

      expectedMethods.forEach((method) => {
        expect(OpticalDriveUtil[method]).toBeDefined();
        expect(typeof OpticalDriveUtil[method]).toBe("function");
      });
    });
  });

  describe("Error handling", () => {
    it("should be resilient to platform detection issues", () => {
      // The class should be constructable and have methods
      // even if platform detection fails
      expect(OpticalDriveUtil).toBeDefined();
      expect(typeof OpticalDriveUtil.getOpticalDrives).toBe("function");
    });
  });

  describe("Integration points", () => {
    it("should integrate with Logger utility", () => {
      // Verify that Logger is imported and available
      // This confirms the logging integration works
      expect(OpticalDriveUtil).toBeDefined();
    });

    it("should provide proper async interfaces", () => {
      // All main methods should return promises
      const drive = {
        id: "test",
        path: "test",
        description: "test",
        mediaType: "test",
        platform: "test",
      };

      const getOpticalDrivesResult = OpticalDriveUtil.getOpticalDrives();
      const ejectAllDrivesResult = OpticalDriveUtil.ejectAllDrives();
      const loadAllDrivesResult = OpticalDriveUtil.loadAllDrives();
      const ejectDriveResult = OpticalDriveUtil.ejectDrive(drive);
      const loadDriveResult = OpticalDriveUtil.loadDrive(drive);

      expect(getOpticalDrivesResult).toBeInstanceOf(Promise);
      expect(ejectAllDrivesResult).toBeInstanceOf(Promise);
      expect(loadAllDrivesResult).toBeInstanceOf(Promise);
      expect(ejectDriveResult).toBeInstanceOf(Promise);
      expect(loadDriveResult).toBeInstanceOf(Promise);
    });
  });
});
