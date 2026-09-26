import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const scriptPath = path.join(
  repoRoot,
  "scripts",
  "stream_dvd_from_vlc_when_inserted.ps1"
);

const readScript = () => readFileSync(scriptPath, "utf8");

describe("VLC DVD streaming setup script", () => {
  it("is available under scripts with safe defaults", () => {
    expect(existsSync(scriptPath)).toBe(true);

    const script = readScript();

    expect(script).toContain("[int]$Port = 8080");
    expect(script).toContain('[string]$Password = "password"');
    expect(script).toContain("[string]$VlcPath");
    expect(script).toContain("[switch]$Uninstall");
  });

  it("runs install-time diagnostics before any DVD insertion is needed", () => {
    const script = readScript();

    expect(script).toContain("function Assert-WindowsHost");
    expect(script).toContain("function Resolve-VlcPath");
    expect(script).toContain("function Assert-VlcCanStart");
    expect(script).toContain("--intf dummy vlc://quit");
    expect(script).not.toContain("--version");
    expect(script).toContain("function Assert-DvdDriveAvailable");
    expect(script).toContain("function Assert-PortAvailable");
    expect(script).toContain("function Assert-NetworkProfile");
    expect(script).toContain("function Assert-FirewallRule");
    expect(script).toContain("function Test-WatcherInstall");
    expect(script).toContain("function Write-InstallError");
    expect(script).toContain("All setup checks passed");
    expect(script).toContain("VLC's built-in web UI is a controller");
  });

  it("generates and registers a DVD insertion watcher for VLC HTTP control", () => {
    const script = readScript();

    expect(script).toContain("function Install-WatcherScript");
    expect(script).toContain("Win32_VolumeChangeEvent");
    expect(script).toContain("function Test-VlcHttpListener");
    expect(script).toContain("VLC HTTP listener is not running");
    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("Start-ScheduledTask");
    expect(script).toContain("-RunLevel Limited");
    expect(script).not.toContain("LeastPrivilege");
    expect(script).toContain("function Install-StartupLauncher");
    expect(script).toContain("CreateShortcut");
    expect(script).toContain("Scheduled task registration failed");
    expect(script).toContain("--extraintf=http");
    expect(script).toContain("--http-host=0.0.0.0");
    expect(script).toContain("--http-port=$Port");
    expect(script).toContain("--http-password=$Password");
    expect(script).toContain("http://{0}:{1}");
  });
});
