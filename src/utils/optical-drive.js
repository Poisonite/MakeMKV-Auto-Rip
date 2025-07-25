import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import fs from "fs/promises";
import { Logger } from "./logger.js";
import { NativeOpticalDrive } from "./native-optical-drive.js";

const execAsync = promisify(exec);

/**
 * Cross-platform optical drive utility for ejecting and loading CD/DVD/Blu-ray drives
 * Supports Windows, macOS, and Linux
 *
 * Active Windows Support: Windows 8/Server 2012 and later (including Windows 10, 11, Server 2016+)
 * Uses MCI (Media Control Interface) which is available across all supported Windows versions
 * Note: May work on older Windows versions, but not tested or officially supported
 */
export class OpticalDriveUtil {
  static #platform = os.platform();

  /**
   * Get all optical drives on the system
   * @returns {Promise<Array<Object>>} Array of optical drive objects
   */
  static async getOpticalDrives() {
    switch (this.#platform) {
      case "win32":
        return await this.#getWindowsOpticalDrives();
      case "darwin":
        return await this.#getMacOpticalDrives();
      case "linux":
        return await this.#getLinuxOpticalDrives();
      default:
        throw new Error(`Unsupported platform: ${this.#platform}`);
    }
  }

  /**
   * Eject all optical drives
   * @returns {Promise<void>}
   */
  static async ejectAllDrives() {
    const drives = await this.getOpticalDrives();
    const ejectPromises = drives.map((drive) => this.ejectDrive(drive));
    await Promise.allSettled(ejectPromises);
  }

  /**
   * Load/close all optical drives
   * @returns {Promise<void>}
   */
  static async loadAllDrives() {
    const drives = await this.getOpticalDrives();
    const loadPromises = drives.map((drive) => this.loadDrive(drive));
    await Promise.allSettled(loadPromises);
  }

  /**
   * Eject a specific optical drive
   * @param {Object} drive - Drive object from getOpticalDrives()
   * @returns {Promise<void>}
   */
  static async ejectDrive(drive) {
    try {
      switch (this.#platform) {
        case "win32":
          await this.#windowsEjectDrive(drive);
          break;
        case "darwin":
          await this.#macEjectDrive(drive);
          break;
        case "linux":
          await this.#linuxEjectDrive(drive);
          break;
      }
      Logger.info(`Ejected drive: ${drive.description}`);
    } catch (error) {
      Logger.warning(
        `Failed to eject drive ${drive.description}: ${error.message}`
      );
    }
  }

  /**
   * Load/close a specific optical drive
   * @param {Object} drive - Drive object from getOpticalDrives()
   * @returns {Promise<void>}
   */
  static async loadDrive(drive) {
    try {
      switch (this.#platform) {
        case "win32":
          await this.#windowsLoadDrive(drive);
          break;
        case "darwin":
          await this.#macLoadDrive(drive);
          break;
        case "linux":
          await this.#linuxLoadDrive(drive);
          break;
      }
      Logger.info(`Loaded drive: ${drive.description}`);
    } catch (error) {
      Logger.warning(
        `Failed to load drive ${drive.description}: ${error.message}`
      );
    }
  }

  // Windows implementation - Hybrid approach: WMI detection + native operations
  // Uses PowerShell WMI for reliable drive detection, native C++ for eject/load operations
  static async #getWindowsOpticalDrives() {
    try {
      // Use PowerShell WMI query for reliable optical drive detection
      const { stdout } = await execAsync(
        'powershell -Command "Get-WmiObject Win32_CDROMDrive | Select-Object Drive, Caption | ConvertTo-Json"'
      );

      let drives = [];
      if (stdout.trim()) {
        const wmiData = JSON.parse(stdout);
        const driveArray = Array.isArray(wmiData) ? wmiData : [wmiData];

        drives = driveArray
          .filter((drive) => drive.Drive) // Only include drives with valid drive letters
          .map((drive) => {
            // Debug logging to see what WMI returns
            Logger.info(
              `[DEBUG] WMI returned drive: "${drive.Drive}" caption: "${drive.Caption}"`
            );
            Logger.info(
              `[DEBUG] Drive char codes: ${Array.from(drive.Drive)
                .map((c) => c.charCodeAt(0))
                .join(", ")}`
            );

            return {
              id: drive.Drive,
              path: drive.Drive,
              description: drive.Caption || "Optical Drive",
              mediaType: "Optical",
              platform: "win32",
            };
          });
      }

      return drives;
    } catch (error) {
      Logger.error(`Windows optical drive detection failed: ${error.message}`);
      return [];
    }
  }

  static async #windowsEjectDrive(drive) {
    try {
      // Use native C++ addon for reliable Windows optical drive control
      if (NativeOpticalDrive.isNativeAvailable) {
        const success = await NativeOpticalDrive.ejectDrive(drive.id);
        if (success) {
          return;
        }
        throw new Error(`Native eject failed for drive ${drive.id}`);
      } else {
        throw new Error("Native optical drive addon is not available");
      }
    } catch (error) {
      Logger.error(`Failed to eject drive ${drive.id}: ${error.message}`);
      throw error;
    }
  }

  static async #windowsLoadDrive(drive) {
    try {
      // Use native C++ addon for reliable Windows optical drive control
      if (NativeOpticalDrive.isNativeAvailable) {
        const success = await NativeOpticalDrive.loadDrive(drive.id);
        if (success) {
          return;
        }
        throw new Error(`Native load failed for drive ${drive.id}`);
      } else {
        throw new Error("Native optical drive addon is not available");
      }
    } catch (error) {
      Logger.error(`Failed to load drive ${drive.id}: ${error.message}`);
      throw error;
    }
  }

  // macOS implementation - Proper optical drive detection
  static async #getMacOpticalDrives() {
    try {
      // Use system_profiler to get disc burning devices (optical drives)
      const { stdout } = await execAsync(
        "system_profiler SPDiscBurningDataType -json"
      );

      const data = JSON.parse(stdout);
      const drives = [];

      if (data.SPDiscBurningDataType && data.SPDiscBurningDataType.length > 0) {
        data.SPDiscBurningDataType.forEach((drive, index) => {
          if (drive && drive._name) {
            drives.push({
              id: `optical${index}`,
              path: `/dev/rdisk${index + 1}`, // Use raw disk device
              description: drive._name,
              mediaType: "Optical",
              platform: "darwin",
            });
          }
        });
      }

      // If no drives found through system_profiler, try diskutil
      if (drives.length === 0) {
        try {
          const { stdout: diskutilOut } = await execAsync("diskutil list");
          const lines = diskutilOut.split("\n");

          for (const line of lines) {
            // Look for optical disk entries
            if (
              line.includes("(optical)") ||
              line.includes("CD_ROM") ||
              line.includes("DVD")
            ) {
              const diskMatch = line.match(/\/dev\/(disk\d+)/);
              if (diskMatch) {
                drives.push({
                  id: diskMatch[1],
                  path: `/dev/r${diskMatch[1]}`,
                  description: "Optical Drive",
                  mediaType: "Optical",
                  platform: "darwin",
                });
              }
            }
          }
        } catch (diskutilError) {
          Logger.warning("Could not detect optical drives via diskutil");
        }
      }

      return drives;
    } catch (error) {
      Logger.error(`macOS optical drive detection failed: ${error.message}`);
      return [];
    }
  }

  static async #macEjectDrive(drive) {
    // Try drutil first (works for most optical drives)
    try {
      await execAsync("drutil tray open");
    } catch (error) {
      // Fallback to diskutil eject for the specific drive
      try {
        await execAsync(`diskutil eject ${drive.path}`);
      } catch (fallbackError) {
        // Final fallback - try drutil eject
        await execAsync("drutil eject");
      }
    }
  }

  static async #macLoadDrive(drive) {
    try {
      await execAsync("drutil tray close");
    } catch (error) {
      Logger.warning("Drive may not support automatic closing");
    }
  }

  // Linux implementation - Proper optical drive detection using /proc and sysfs
  static async #getLinuxOpticalDrives() {
    try {
      const drives = [];

      // Method 1: Check /proc/sys/dev/cdrom/info for optical drives
      try {
        const cdromInfo = await fs.readFile("/proc/sys/dev/cdrom/info", "utf8");
        const lines = cdromInfo.split("\n");
        const driveNameLine = lines.find((line) =>
          line.startsWith("drive name:")
        );

        if (driveNameLine) {
          const driveNames = driveNameLine.split(":")[1].trim().split(/\s+/);

          for (const driveName of driveNames) {
            if (driveName && driveName.startsWith("sr")) {
              const devicePath = `/dev/${driveName}`;

              try {
                // Verify the device exists and get additional info
                await fs.access(devicePath);

                let description = "Optical Drive";
                try {
                  const { stdout } = await execAsync(
                    `udevadm info --query=property --name=${devicePath} 2>/dev/null`
                  );
                  const modelMatch = stdout.match(/ID_MODEL=(.+)/);
                  if (modelMatch) {
                    description = modelMatch[1].replace(/_/g, " ");
                  }
                } catch {
                  // If udevadm fails, keep default description
                }

                drives.push({
                  id: driveName,
                  path: devicePath,
                  description: description,
                  mediaType: "Optical",
                  platform: "linux",
                });
              } catch {
                // Device doesn't exist or isn't accessible
                continue;
              }
            }
          }
        }
      } catch (procError) {
        Logger.warning("Could not read /proc/sys/dev/cdrom/info");
      }

      // Method 2: If no drives found, scan /sys/block for optical devices
      if (drives.length === 0) {
        try {
          const blockDevices = await fs.readdir("/sys/block");

          for (const device of blockDevices) {
            // Check if it's a CD/DVD drive by examining the device type
            try {
              const devicePath = `/sys/block/${device}`;
              const removableFile = `${devicePath}/removable`;
              const capabilityFile = `${devicePath}/capability`;

              // Check if device is removable
              const removable = await fs.readFile(removableFile, "utf8");
              if (removable.trim() !== "1") continue;

              // Check capabilities for optical drive indicators
              const capability = await fs.readFile(capabilityFile, "utf8");
              const capNum = parseInt(capability.trim(), 16);

              // Check for optical drive capabilities (bits for CD-ROM, etc.)
              // Bit 3 (0x8) = CD-ROM, Bit 4 (0x10) = DVD
              if (capNum & 0x8 || capNum & 0x10) {
                const deviceFile = `/dev/${device}`;

                try {
                  await fs.access(deviceFile);

                  let description = "Optical Drive";
                  try {
                    const { stdout } = await execAsync(
                      `udevadm info --query=property --name=${deviceFile} 2>/dev/null`
                    );
                    const modelMatch = stdout.match(/ID_MODEL=(.+)/);
                    if (modelMatch) {
                      description = modelMatch[1].replace(/_/g, " ");
                    }
                  } catch {
                    // Keep default description
                  }

                  drives.push({
                    id: device,
                    path: deviceFile,
                    description: description,
                    mediaType: "Optical",
                    platform: "linux",
                  });
                } catch {
                  continue;
                }
              }
            } catch {
              continue;
            }
          }
        } catch (sysError) {
          Logger.warning("Could not scan /sys/block for optical drives");
        }
      }

      return drives;
    } catch (error) {
      Logger.error(`Linux optical drive detection failed: ${error.message}`);
      return [];
    }
  }

  static async #linuxEjectDrive(drive) {
    await execAsync(`eject ${drive.path}`);
  }

  static async #linuxLoadDrive(drive) {
    try {
      await execAsync(`eject -t ${drive.path}`);
    } catch (error) {
      Logger.warning(`Drive ${drive.path} may not support automatic loading`);
    }
  }
}
