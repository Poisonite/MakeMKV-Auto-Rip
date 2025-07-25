# PowerShell script to load/close optical drives using MCI (Media Control Interface)
# Compatible with Windows 8/Server 2012 and later

param(
    [string]$DriveLetter = ""
)

# Define the MCI class for accessing winmm.dll
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class MCI {
    [DllImport("winmm.dll")]
    public static extern long mciSendString(
        string command, 
        System.Text.StringBuilder returnValue, 
        int returnLength, 
        IntPtr hwndCallback
    );
}
"@

try {
    # Execute MCI command to close the CD/DVD drive
    $result = [MCI]::mciSendString('set cdaudio door closed', $null, 0, [IntPtr]::Zero)
    
    if ($result -eq 0) {
        Write-Host "Drive load command executed successfully"
        exit 0
    } else {
        Write-Error "MCI command failed with error code: $result"
        exit 1
    }
} catch {
    Write-Error "Failed to load drive: $($_.Exception.Message)"
    exit 1
}