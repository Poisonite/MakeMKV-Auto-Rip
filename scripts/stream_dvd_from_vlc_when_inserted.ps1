#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,

    [string]$Password = "password",

    [string]$VlcPath,

    [switch]$Uninstall,

    [switch]$NoFirewallRule,

    [switch]$Force
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$TaskName = "MakeMKV Auto Rip - VLC DVD Streamer"
$InstallRoot = Join-Path $env:LOCALAPPDATA "MakeMKV-Auto-Rip\vlc-dvd-streamer"
$WatcherPath = Join-Path $InstallRoot "watch_dvd_for_vlc_stream.ps1"
$ConfigPath = Join-Path $InstallRoot "config.json"
$LogPath = Join-Path $InstallRoot "watcher.log"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$StartupShortcutPath = Join-Path $StartupFolder "MakeMKV Auto Rip VLC DVD Streamer.lnk"
$FirewallRuleNamePrefix = "MakeMKV Auto Rip VLC DVD Streamer"
$FirewallRuleName = "$FirewallRuleNamePrefix ($Port)"

if (-not $PSBoundParameters.ContainsKey("Password") -and $env:VLC_DVD_STREAM_PASSWORD) {
    $Password = $env:VLC_DVD_STREAM_PASSWORD
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "    OK: $Message" -ForegroundColor Green
}

function Write-Notice {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

function Write-InstallError {
    param(
        [string]$Message,
        [string[]]$Details = @(),
        [string[]]$NextSteps = @()
    )

    Write-Host ""
    Write-Host "VLC DVD streaming setup did not complete." -ForegroundColor Red
    Write-Host $Message -ForegroundColor Red

    if ($Details.Count -gt 0) {
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Yellow
        foreach ($detail in $Details) {
            Write-Host "  - $detail" -ForegroundColor Yellow
        }
    }

    if ($NextSteps.Count -gt 0) {
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        foreach ($nextStep in $NextSteps) {
            Write-Host "  - $nextStep" -ForegroundColor Yellow
        }
    }
}

function Assert-WindowsHost {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
        throw "This setup script only supports Windows desktop PCs. Run it from Windows PowerShell on the PC with the DVD drive."
    }

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw "LOCALAPPDATA is not available, so the watcher cannot be installed in the current user's profile. Log in as the desktop user that should run VLC and try again."
    }

    if (-not (Get-Command Get-CimInstance -ErrorAction SilentlyContinue)) {
        throw "PowerShell cannot find Get-CimInstance. This script needs CIM/WMI access to detect DVD drive insertion events."
    }

    Write-Success "Windows host and user profile look usable."
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-VlcPath {
    param([string]$RequestedPath)

    $candidates = New-Object System.Collections.Generic.List[string]

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        $candidates.Add($RequestedPath)
    }

    if (-not [string]::IsNullOrWhiteSpace($env:VLC_PATH)) {
        $candidates.Add($env:VLC_PATH)
    }

    $programFiles = [Environment]::GetFolderPath("ProgramFiles")
    $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
    $localAppData = [Environment]::GetFolderPath("LocalApplicationData")

    if (-not [string]::IsNullOrWhiteSpace($programFiles)) {
        $candidates.Add((Join-Path $programFiles "VideoLAN\VLC\vlc.exe"))
    }

    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $candidates.Add((Join-Path $programFilesX86 "VideoLAN\VLC\vlc.exe"))
    }

    if (-not [string]::IsNullOrWhiteSpace($localAppData)) {
        $candidates.Add((Join-Path $localAppData "Programs\VideoLAN\VLC\vlc.exe"))
    }

    $command = Get-Command "vlc.exe" -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        $candidates.Add($command.Source)
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "VLC was not found. Install VLC from https://www.videolan.org/vlc/ or rerun this script with -VlcPath 'C:\Program Files\VideoLAN\VLC\vlc.exe'."
}

function Invoke-ProcessWithTimeout {
    param(
        [string]$FilePath,
        [string]$Arguments,
        [int]$TimeoutSeconds = 15
    )

    $processStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processStartInfo.FileName = $FilePath
    $processStartInfo.Arguments = $Arguments
    $processStartInfo.UseShellExecute = $false
    $processStartInfo.RedirectStandardOutput = $true
    $processStartInfo.RedirectStandardError = $true
    $processStartInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processStartInfo

    try {
        if (-not $process.Start()) {
            throw "Process did not start."
        }

        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try {
                $process.Kill()
            }
            catch {
                Write-Verbose "Could not terminate timed-out process: $($_.Exception.Message)"
            }

            throw "'$FilePath $Arguments' did not finish within $TimeoutSeconds seconds."
        }

        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout = $process.StandardOutput.ReadToEnd()
            Stderr = $process.StandardError.ReadToEnd()
        }
    }
    finally {
        $process.Dispose()
    }
}

function Assert-VlcCanStart {
    param([string]$ResolvedVlcPath)

    $result = Invoke-ProcessWithTimeout -FilePath $ResolvedVlcPath -Arguments "--intf dummy vlc://quit" -TimeoutSeconds 15
    if ($result.ExitCode -ne 0) {
        $output = (($result.Stdout, $result.Stderr) -join "`n").Trim()
        throw "VLC was found at '$ResolvedVlcPath', but a dummy-interface startup smoke test exited with code $($result.ExitCode). Output: $output"
    }

    $version = (Get-Item -LiteralPath $ResolvedVlcPath).VersionInfo.ProductVersion
    Write-Success "VLC startup smoke test passed from '$ResolvedVlcPath'$(if ($version) { " (version $version)" })."
}

function Assert-DvdDriveAvailable {
    $drives = @(Get-CimInstance -ClassName Win32_CDROMDrive -ErrorAction Stop)
    if ($drives.Count -eq 0) {
        throw "No DVD or Blu-ray drive was found through Win32_CDROMDrive. Attach the optical drive before installing so insertion can be tested later without a monitor."
    }

    $drivesWithLetters = @($drives | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Drive) })
    if ($drivesWithLetters.Count -eq 0) {
        throw "An optical drive exists, but Windows has not assigned it a drive letter. Assign a drive letter in Disk Management, then rerun this setup."
    }

    foreach ($drive in $drivesWithLetters) {
        Write-Success ("Detected optical drive {0}: {1}" -f $drive.Drive, $drive.Name)
    }
}

function Assert-PortAvailable {
    param([int]$Port)

    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        Write-Success "TCP port $Port is available for VLC HTTP control."
    }
    catch {
        throw "TCP port $Port is already in use or cannot be opened. Stop the process using it or rerun with -Port <freePort>. Original error: $($_.Exception.Message)"
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Assert-NetworkProfile {
    if (-not (Get-Command Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
        Write-Notice "Cannot inspect the Windows network profile on this host. Make sure the PC is on a trusted local network before relying on remote access."
        return
    }

    $profiles = @(Get-NetConnectionProfile -ErrorAction Stop | Where-Object {
        $_.IPv4Connectivity -ne "Disconnected" -or $_.IPv6Connectivity -ne "Disconnected"
    })

    if ($profiles.Count -eq 0) {
        Write-Notice "No active network profile is connected right now. Remote devices will need a local network connection before they can reach VLC."
        return
    }

    $publicProfiles = @($profiles | Where-Object { $_.NetworkCategory -eq "Public" })
    if ($publicProfiles.Count -gt 0) {
        $profileNames = (($publicProfiles | ForEach-Object { $_.Name }) -join ", ")
        $message = "Active network profile '$profileNames' is Public. Windows usually blocks inbound local-network access on Public profiles. Change the PC's network profile to Private, then rerun this setup."

        if ($NoFirewallRule) {
            Write-Notice $message
            return
        }

        throw $message
    }

    $profileSummary = (($profiles | ForEach-Object { "{0} ({1})" -f $_.Name, $_.NetworkCategory }) -join ", ")
    Write-Success "Active network profile allows local-network firewall setup: $profileSummary."
}

function Assert-FirewallRule {
    param(
        [string]$ResolvedVlcPath,
        [int]$Port
    )

    if ($NoFirewallRule) {
        Write-Notice "Skipping Windows Firewall setup because -NoFirewallRule was supplied. Verify inbound TCP $Port is allowed before relying on remote access."
        return
    }

    if (-not (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) -or -not (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue)) {
        throw "Windows Firewall PowerShell commands are not available. Rerun with -NoFirewallRule only if firewall policy is managed elsewhere and TCP $Port is already open."
    }

    if (-not (Test-IsAdministrator)) {
        throw "Creating the inbound firewall rule requires an elevated PowerShell window. Rerun as Administrator, or rerun with -NoFirewallRule if another firewall policy already allows TCP $Port to this PC."
    }

    $existingRule = Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingRule) {
        Write-Success "Firewall rule '$FirewallRuleName' already exists."
        return
    }

    New-NetFirewallRule `
        -DisplayName $FirewallRuleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Program $ResolvedVlcPath `
        -Profile Domain,Private `
        -Description "Allows VLC DVD HTTP control installed by MakeMKV Auto Rip." | Out-Null

    Write-Success "Created Windows Firewall rule '$FirewallRuleName'."
}

function Install-WatcherScript {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null

    $watcherScript = @'
#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [switch]$SelfTest,

    [switch]$Once
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-WatcherLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line

    if ($script:LogPath) {
        Add-Content -Path $script:LogPath -Value $line -Encoding UTF8
    }
}

function Read-StreamerConfig {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Config file '$Path' does not exist. Rerun the setup script."
    }

    $config = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($requiredProperty in @("VlcPath", "Port", "Password", "LogPath")) {
        if ($config.PSObject.Properties.Name -notcontains $requiredProperty) {
            throw "Config file '$Path' is missing '$requiredProperty'. Rerun the setup script."
        }
    }

    return $config
}

function Test-PortAvailable {
    param([int]$Port)

    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Get-LoadedDvdDrives {
    $drives = @(Get-CimInstance -ClassName Win32_CDROMDrive -ErrorAction Stop | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_.Drive) -and $_.MediaLoaded -eq $true
    })

    return @($drives | Select-Object -ExpandProperty Drive -Unique)
}

function Stop-ExistingVlcStreamer {
    param([int]$Port)

    $portNeedleEquals = "--http-port=$Port"
    $portNeedleSpace = "--http-port $Port"
    $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'vlc.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*$portNeedleEquals*" -or $_.CommandLine -like "*$portNeedleSpace*"
    })

    foreach ($process in $processes) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Write-WatcherLog "Stopped existing VLC streamer process $($process.ProcessId) for port $Port."
        }
        catch {
            Write-WatcherLog "Could not stop existing VLC process $($process.ProcessId): $($_.Exception.Message)" "WARN"
        }
    }
}

function Test-VlcHttpListener {
    param([int]$Port)

    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Where-Object {
            $owner = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            $owner -and $owner.ProcessName -eq "vlc"
        })

        if ($listeners.Count -gt 0) {
            return $true
        }
    }

    $portNeedleEquals = "--http-port=$Port"
    $portNeedleSpace = "--http-port $Port"
    $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'vlc.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*$portNeedleEquals*" -or $_.CommandLine -like "*$portNeedleSpace*"
    })

    return $processes.Count -gt 0
}

function Start-VlcDvdStream {
    param(
        [string]$Drive,
        [pscustomobject]$Config
    )

    $Port = [int]$Config.Port
    $Password = [string]$Config.Password
    $driveRoot = $Drive.TrimEnd("\")
    $dvdUri = "dvd:///$driveRoot/"

    Stop-ExistingVlcStreamer -Port $Port

    if (-not (Test-PortAvailable -Port $Port)) {
        Write-WatcherLog "Cannot start VLC because TCP port $Port is already in use. Stop the conflicting process or reinstall with a different -Port." "ERROR"
        return
    }

    $arguments = @(
        "--intf=dummy",
        "--extraintf=http",
        "--http-host=0.0.0.0",
        "--http-port=$Port",
        "--http-password=$Password",
        "--no-video-title-show",
        "--quiet",
        $dvdUri
    )

    Start-Process -FilePath $Config.VlcPath -ArgumentList $arguments -WindowStyle Hidden | Out-Null
    Write-WatcherLog ("Started VLC DVD control for {0}. Control URL: http://{1}:{2}" -f $Drive, $env:COMPUTERNAME, $Port)
}

function Invoke-SelfTest {
    param([pscustomobject]$Config)

    if (-not (Test-Path -LiteralPath $Config.VlcPath -PathType Leaf)) {
        throw "VLC path '$($Config.VlcPath)' does not exist. Rerun setup with -VlcPath."
    }

    $drives = @(Get-CimInstance -ClassName Win32_CDROMDrive -ErrorAction Stop)
    if ($drives.Count -eq 0) {
        throw "No optical drive is visible to the watcher account. Attach the drive and rerun setup."
    }

    if (-not (Test-PortAvailable -Port ([int]$Config.Port))) {
        throw "TCP port $($Config.Port) is not available to the watcher. Stop the conflicting process or rerun setup with -Port."
    }

    Write-WatcherLog "Watcher self-test passed."
}

function Wait-ForDvdArrival {
    $sourceIdentifier = "MakeMKVAutoRipDvdVolumeChange"

    try {
        Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
        Register-WmiEvent -Query "SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2" -SourceIdentifier $sourceIdentifier | Out-Null
        $event = Wait-Event -SourceIdentifier $sourceIdentifier -Timeout 20
        if ($event) {
            Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        }
    }
    catch {
        Write-WatcherLog "Volume event watcher had a recoverable error: $($_.Exception.Message)" "WARN"
        Start-Sleep -Seconds 10
    }
    finally {
        Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
    }
}

$config = Read-StreamerConfig -Path $ConfigPath
$script:LogPath = [string]$config.LogPath
New-Item -ItemType Directory -Path (Split-Path -Parent $script:LogPath) -Force | Out-Null

if ($SelfTest) {
    Invoke-SelfTest -Config $config
    exit 0
}

Write-WatcherLog ("Watcher started. Waiting for DVD media. Control URL after launch: http://{0}:{1}" -f $env:COMPUTERNAME, $config.Port)
$activeDrive = $null

while ($true) {
    try {
        $loadedDrives = @(Get-LoadedDvdDrives)
        $vlcHttpListenerRunning = Test-VlcHttpListener -Port ([int]$config.Port)
        if ($loadedDrives.Count -eq 0) {
            $activeDrive = $null
        }
        else {
            foreach ($loadedDrive in $loadedDrives) {
                if ($loadedDrive -ne $activeDrive -or -not $vlcHttpListenerRunning) {
                    if ($loadedDrive -eq $activeDrive -and -not $vlcHttpListenerRunning) {
                        Write-WatcherLog "VLC HTTP listener is not running while DVD media remains inserted. Restarting VLC." "WARN"
                    }

                    Start-VlcDvdStream -Drive $loadedDrive -Config $config
                    $activeDrive = $loadedDrive
                    break
                }
            }
        }
    }
    catch {
        Write-WatcherLog "DVD watcher loop error: $($_.Exception.Message)" "ERROR"
    }

    if ($Once) {
        break
    }

    Wait-ForDvdArrival
}
'@

    Set-Content -Path $WatcherPath -Value $watcherScript -Encoding UTF8
    Write-Success "Installed watcher script at '$WatcherPath'."
}

function Save-Config {
    param(
        [string]$ResolvedVlcPath,
        [int]$Port,
        [string]$Password
    )

    $config = [ordered]@{
        VlcPath = $ResolvedVlcPath
        Port = $Port
        Password = $Password
        LogPath = $LogPath
        InstalledAt = (Get-Date).ToString("o")
        ComputerName = $env:COMPUTERNAME
    }

    $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
    Write-Success "Saved watcher configuration at '$ConfigPath'."
}

function Test-WatcherInstall {
    $powershellPath = (Get-Command "powershell.exe" -ErrorAction Stop).Source
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ('"{0}"' -f $WatcherPath),
        "-ConfigPath",
        ('"{0}"' -f $ConfigPath),
        "-SelfTest"
    ) -join " "

    $result = Invoke-ProcessWithTimeout -FilePath $powershellPath -Arguments $arguments -TimeoutSeconds 20
    if ($result.ExitCode -ne 0) {
        $output = (($result.Stdout, $result.Stderr) -join "`n").Trim()
        throw "The generated watcher failed its self-test. Output: $output"
    }

    Write-Success "Generated watcher passed its self-test."
}

function Stop-ExistingWatcherProcesses {
    $watcherNeedle = $WatcherPath.Replace("'", "''")
    $processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -eq "powershell.exe" -or $_.Name -eq "pwsh.exe") -and
        $_.ProcessId -ne $PID -and
        $_.CommandLine -like "*$watcherNeedle*"
    })

    foreach ($process in $processes) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Write-Notice "Stopped older watcher process $($process.ProcessId)."
        }
        catch {
            Write-Notice "Could not stop older watcher process $($process.ProcessId): $($_.Exception.Message)"
        }
    }
}

function Install-StartupLauncher {
    param(
        [string]$PowershellPath,
        [string]$Arguments
    )

    if ([string]::IsNullOrWhiteSpace($StartupFolder)) {
        throw "Windows did not return a current-user Startup folder path. Run this setup as the desktop user that should run VLC."
    }

    New-Item -ItemType Directory -Path $StartupFolder -Force | Out-Null

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($StartupShortcutPath)
    $shortcut.TargetPath = $PowershellPath
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $InstallRoot
    $shortcut.WindowStyle = 7
    $shortcut.Description = "Starts VLC HTTP control when DVD media is inserted."
    $shortcut.Save()

    Write-Success "Installed current-user Startup launcher at '$StartupShortcutPath'."
}

function Register-StreamingTask {
    $powershellPath = (Get-Command "powershell.exe" -ErrorAction Stop).Source
    $taskArguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ('"{0}"' -f $WatcherPath),
        "-ConfigPath",
        ('"{0}"' -f $ConfigPath)
    ) -join " "

    $action = New-ScheduledTaskAction -Execute $powershellPath -Argument $taskArguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)

    try {
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger $trigger `
            -Principal $principal `
            -Settings $settings `
            -Description "Starts VLC HTTP control whenever DVD media is inserted." `
            -Force | Out-Null

        if (Test-Path -LiteralPath $StartupShortcutPath) {
            Remove-Item -LiteralPath $StartupShortcutPath -Force
            Write-Notice "Removed older Startup launcher because scheduled task registration succeeded."
        }

        Write-Success "Registered scheduled task '$TaskName' for the current user's logon."

        try {
            Start-ScheduledTask -TaskName $TaskName
            Write-Success "Started scheduled task '$TaskName' for the current session."
        }
        catch {
            Write-Notice "The task was registered but could not be started immediately: $($_.Exception.Message)"
            Write-Notice "It will start automatically the next time this user logs in."
        }
    }
    catch {
        Write-Notice "Scheduled task registration failed: $($_.Exception.Message)"
        Write-Notice "Installing a current-user Startup folder launcher instead."
        Install-StartupLauncher -PowershellPath $powershellPath -Arguments $taskArguments
        Start-Process -FilePath $powershellPath -ArgumentList $taskArguments -WindowStyle Hidden | Out-Null
        Write-Success "Started watcher process for the current session."
    }
}

function Show-AutoPlayGuidance {
    Write-Step "Review Windows AutoPlay settings"
    Write-Notice "This installer uses a logon watcher because modern Windows does not reliably allow classic DVD AutoRun scripts."
    Write-Notice "AutoPlay can stay enabled for normal Windows behavior; the watcher will start VLC when DVD media appears."

    try {
        Start-Process "ms-settings:autoplay" | Out-Null
        Write-Success "Opened Windows AutoPlay settings."
    }
    catch {
        Write-Notice "Could not open Settings automatically. Open Settings > Bluetooth & devices > AutoPlay manually if you want to review it."
    }
}

function Get-LocalControlUrls {
    param([int]$Port)

    $urls = New-Object System.Collections.Generic.List[string]
    $urls.Add(("http://{0}:{1}" -f $env:COMPUTERNAME, $Port))

    try {
        $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object {
            $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*"
        })

        foreach ($address in $addresses) {
            $urls.Add(("http://{0}:{1}" -f $address.IPAddress, $Port))
        }
    }
    catch {
        try {
            $hostEntry = [System.Net.Dns]::GetHostEntry($env:COMPUTERNAME)
            foreach ($address in $hostEntry.AddressList) {
                if ($address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and $address.ToString() -notlike "127.*") {
                    $urls.Add(("http://{0}:{1}" -f $address.ToString(), $Port))
                }
            }
        }
        catch {
            Write-Verbose "Could not enumerate local IP addresses: $($_.Exception.Message)"
        }
    }

    return @($urls | Select-Object -Unique)
}

function Show-InstallSummary {
    param(
        [string]$ResolvedVlcPath,
        [int]$Port
    )

    Write-Host ""
    Write-Host "All setup checks passed." -ForegroundColor Green
    Write-Host ""
    Write-Host "Installed components:"
    Write-Host "  VLC:      $ResolvedVlcPath"
    Write-Host "  Watcher:  $WatcherPath"
    Write-Host "  Config:   $ConfigPath"
    Write-Host "  Log:      $LogPath"
    Write-Host "  Task:     $TaskName"
    if (Test-Path -LiteralPath $StartupShortcutPath) {
        Write-Host "  Startup:  $StartupShortcutPath"
    }
    Write-Host ""
    Write-Host "When a DVD is inserted, browse to one of these URLs from another device on the local network:"
    foreach ($url in (Get-LocalControlUrls -Port $Port)) {
        Write-Host "  $url"
    }
    Write-Host ""
    Write-Host "VLC HTTP control password: $Password"
    Write-Host "Note: VLC's built-in web UI is a controller. Its browser video viewer is legacy Flash-based and does not play video in modern browsers."
    Write-Host "To change it later, rerun this script with -Password <newPassword>."
    Write-Host "To remove the watcher, run:"
    Write-Host ('  powershell.exe -ExecutionPolicy Bypass -File "{0}" -Uninstall' -f $PSCommandPath)
}

function Uninstall-Streamer {
    Write-Step "Removing installed VLC DVD streamer"

    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($task) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Success "Removed scheduled task '$TaskName'."
        }
        else {
            Write-Notice "Scheduled task '$TaskName' was not installed."
        }
    }
    catch {
        throw "Could not remove scheduled task '$TaskName': $($_.Exception.Message)"
    }

    if (-not $NoFirewallRule -and (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) -and (Get-Command Remove-NetFirewallRule -ErrorAction SilentlyContinue)) {
        if (Test-IsAdministrator) {
            $rules = @(Get-NetFirewallRule -DisplayName "$FirewallRuleNamePrefix*" -ErrorAction SilentlyContinue)
            if ($rules.Count -gt 0) {
                $rules | Remove-NetFirewallRule
                Write-Success "Removed $($rules.Count) firewall rule(s)."
            }
        }
        else {
            Write-Notice "Run uninstall as Administrator to remove firewall rules, or remove '$FirewallRuleNamePrefix*' manually."
        }
    }

    if (Test-Path -LiteralPath $StartupShortcutPath) {
        Remove-Item -LiteralPath $StartupShortcutPath -Force
        Write-Success "Removed Startup launcher '$StartupShortcutPath'."
    }

    if (Test-Path -LiteralPath $InstallRoot) {
        Remove-Item -LiteralPath $InstallRoot -Recurse -Force
        Write-Success "Removed '$InstallRoot'."
    }

    Write-Success "Uninstall complete."
}

function Invoke-Install {
    Write-Host "MakeMKV Auto Rip VLC DVD streaming setup" -ForegroundColor White
    Write-Host "This installs a user-logon watcher that starts VLC HTTP control when DVD media is inserted." -ForegroundColor Gray

    Write-Step "Checking Windows host"
    Assert-WindowsHost

    if ([string]::IsNullOrWhiteSpace($Password)) {
        throw "The VLC HTTP password cannot be empty. Rerun with -Password <value>."
    }

    if ($Password -eq "password") {
        Write-Notice "Using the default VLC HTTP password 'password'. Rerun with -Password <value> to change it."
    }

    Write-Step "Finding VLC"
    $resolvedVlcPath = Resolve-VlcPath -RequestedPath $VlcPath
    Assert-VlcCanStart -ResolvedVlcPath $resolvedVlcPath

    Write-Step "Checking optical drive"
    Assert-DvdDriveAvailable

    Write-Step "Checking TCP port"
    Assert-PortAvailable -Port $Port

    Write-Step "Checking network profile"
    Assert-NetworkProfile

    Write-Step "Checking Windows Firewall"
    Assert-FirewallRule -ResolvedVlcPath $resolvedVlcPath -Port $Port

    if ((Test-Path -LiteralPath $InstallRoot) -and -not $Force) {
        Write-Notice "Existing install folder will be updated in place. Use -Uninstall to remove it completely."
    }

    Write-Step "Installing watcher"
    Install-WatcherScript
    Save-Config -ResolvedVlcPath $resolvedVlcPath -Port $Port -Password $Password
    Test-WatcherInstall

    Write-Step "Registering Windows logon task"
    Stop-ExistingWatcherProcesses
    Register-StreamingTask

    Show-AutoPlayGuidance
    Show-InstallSummary -ResolvedVlcPath $resolvedVlcPath -Port $Port
}

try {
    if ($Uninstall) {
        Assert-WindowsHost
        Uninstall-Streamer
    }
    else {
        Invoke-Install
    }
}
catch {
    Write-InstallError `
        -Message $_.Exception.Message `
        -Details @(
            "Install folder: $InstallRoot",
            "Watcher log after a successful install: $LogPath",
            "Run with -Verbose for more PowerShell detail."
        ) `
        -NextSteps @(
            "Fix the issue reported above and rerun this setup before inserting a DVD.",
            "Use -VlcPath if VLC is installed somewhere unusual.",
            "Use -Port if TCP $Port is already taken.",
            "Set the active Windows network profile to Private for local-network access.",
            "Use -NoFirewallRule only when firewall policy is handled outside this script."
        )
    exit 1
}
