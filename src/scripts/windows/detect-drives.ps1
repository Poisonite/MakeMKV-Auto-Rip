# PowerShell script to detect optical drives using WMI
# Compatible with Windows 8/Server 2012 and later

try {
    # Query for optical drive devices using WMI
    $opticalDrives = Get-WmiObject -Class Win32_LogicalDisk -Filter "DriveType=5" | 
                     Select-Object DeviceID, VolumeName, MediaType, Description

    # If no drives found via logical disk, try CDRom drives
    if (-not $opticalDrives) {
        $opticalDrives = Get-WmiObject -Class Win32_CDROMDrive |
                        Select-Object @{Name="DeviceID";Expression={$_.Drive}}, 
                                     @{Name="VolumeName";Expression={$_.VolumeName}},
                                     @{Name="MediaType";Expression={$_.MediaType}},
                                     @{Name="Description";Expression={$_.Description}}
    }

    # Convert to JSON format for consistent parsing
    if ($opticalDrives) {
        $driveArray = @()
        foreach ($drive in $opticalDrives) {
            $driveArray += @{
                Drive = $drive.DeviceID
                VolumeName = if ($drive.VolumeName) { $drive.VolumeName } else { "Optical Drive" }
                MediaType = if ($drive.MediaType) { $drive.MediaType } else { "CD-ROM" }
                Description = if ($drive.Description) { $drive.Description } else { "Optical Drive" }
            }
        }
        
        # Output as JSON array
        $driveArray | ConvertTo-Json -Compress
    } else {
        # Return empty array if no drives found
        Write-Output "[]"
    }
    
    exit 0
} catch {
    Write-Error "Failed to detect optical drives: $($_.Exception.Message)"
    Write-Output "[]"
    exit 1
}