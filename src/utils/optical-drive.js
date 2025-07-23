import { spawn, exec } from "child_process";
import { promisify } from "util";
import os from "os";
import fs from "fs/promises";
import { Logger } from "./logger.js";

const execAsync = promisify(exec);

/**
 * Cross-platform optical drive utility for ejecting and loading CD/DVD/Blu-ray drives
 * Supports Windows, macOS, and Linux
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
    if (drives.length === 0) {
      Logger.warning("No optical drives found to eject");
      return;
    }

    const ejectPromises = drives.map((drive) => this.ejectDrive(drive));
    await Promise.allSettled(ejectPromises);
    Logger.info(`Ejected ${drives.length} optical drive(s)`);
  }

  /**
   * Load/close all optical drives
   * @returns {Promise<void>}
   */
  static async loadAllDrives() {
    const drives = await this.getOpticalDrives();
    if (drives.length === 0) {
      Logger.warning("No optical drives found to load");
      return;
    }

    const loadPromises = drives.map((drive) => this.loadDrive(drive));
    await Promise.allSettled(loadPromises);
    Logger.info(`Loaded/closed ${drives.length} optical drive(s)`);
  }

  /**
   * Eject a specific optical drive
   * @param {Object} drive - Drive object with platform-specific properties
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
        default:
          throw new Error(`Unsupported platform: ${this.#platform}`);
      }
    } catch (error) {
      Logger.error(`Failed to eject drive ${drive.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load/close a specific optical drive
   * @param {Object} drive - Drive object with platform-specific properties
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
        default:
          throw new Error(`Unsupported platform: ${this.#platform}`);
      }
    } catch (error) {
      Logger.error(`Failed to load drive ${drive.id}: ${error.message}`);
      throw error;
    }
  }

  // Windows implementation
  static async #getWindowsOpticalDrives() {
    try {
      // Use PowerShell to get optical drives
      const { stdout } = await execAsync(
        'powershell -Command "Get-WmiObject -Class Win32_CDROMDrive | Select-Object Drive, MediaType, Description | ConvertTo-Json"'
      );

      let drives = JSON.parse(stdout || "[]");
      if (!Array.isArray(drives)) {
        drives = [drives];
      }

      return drives
        .filter((drive) => drive && drive.Drive)
        .map((drive) => ({
          id: drive.Drive,
          path: drive.Drive,
          description: drive.Description || "Optical Drive",
          mediaType: drive.MediaType || "Unknown",
          platform: "win32",
        }));
    } catch (error) {
      Logger.error(`Windows optical drive detection failed: ${error.message}`);
      return [];
    }
  }

  static async #windowsEjectDrive(drive) {
    // Use PowerShell to eject the drive
    const command = `powershell -Command "(New-Object -comObject Shell.Application).Namespace(17).ParseName('${drive.path}').InvokeVerb('Eject')"`;
    await execAsync(command);
  }

  static async #windowsLoadDrive(drive) {
    // Use PowerShell MCI command to close the drive
    const command = `powershell -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MCI { [DllImport(\\"winmm.dll\\")] public static extern long mciSendString(string command, System.Text.StringBuilder returnValue, int returnLength, IntPtr hwndCallback); }'; [MCI]::mciSendString('set cdaudio door closed', $null, 0, [IntPtr]::Zero)"`;
    await execAsync(command);
  }

  // macOS implementation
  static async #getMacOpticalDrives() {
    try {
      // Use system_profiler to get optical drives
      const { stdout } = await execAsync(
        "system_profiler SPDiscBurningDataType -json"
      );

      const data = JSON.parse(stdout);
      const drives = [];

      if (data.SPDiscBurningDataType) {
        data.SPDiscBurningDataType.forEach((drive, index) => {
          if (drive && drive._name) {
            drives.push({
              id: `drive${index}`,
              path: `/dev/disk${index}`,
              description: drive._name,
              mediaType: "Optical",
              platform: "darwin",
            });
          }
        });
      }

      return drives;
    } catch (error) {
      // Fallback: just assume there's at least one optical drive
      Logger.warning("Could not detect specific optical drives, using default");
      return [
        {
          id: "default",
          path: "/dev/disk1",
          description: "Default Optical Drive",
          mediaType: "Optical",
          platform: "darwin",
        },
      ];
    }
  }

  static async #macEjectDrive(drive) {
    // Try drutil first, fallback to diskutil
    try {
      await execAsync("drutil tray open");
    } catch (error) {
      // Fallback to diskutil eject
      await execAsync("drutil eject");
    }
  }

  static async #macLoadDrive(drive) {
    try {
      await execAsync("drutil tray close");
    } catch (error) {
      // Some drives don't support tray close
      Logger.warning("Drive may not support automatic closing");
    }
  }

  // Linux implementation
  static async #getLinuxOpticalDrives() {
    try {
      const drives = [];

      // Check for common optical drive device files
      const devicePaths = [
        "/dev/cdrom",
        "/dev/dvd",
        "/dev/sr0",
        "/dev/sr1",
        "/dev/sr2",
        "/dev/sr3",
      ];

      for (const devicePath of devicePaths) {
        try {
          await fs.access(devicePath);
          // Get additional info about the drive
          const { stdout } = await execAsync(
            `udevadm info --query=property --name=${devicePath} 2>/dev/null || echo "ID_MODEL=Unknown"`
          );

          const model = stdout.match(/ID_MODEL=(.+)/)?.[1] || "Optical Drive";

          drives.push({
            id: devicePath.split("/").pop(),
            path: devicePath,
            description: model.replace(/_/g, " "),
            mediaType: "Optical",
            platform: "linux",
          });
        } catch {
          // Device doesn't exist, skip
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
      // Some drives don't support loading/closing
      Logger.warning(`Drive ${drive.path} may not support automatic loading`);
    }
  }
}