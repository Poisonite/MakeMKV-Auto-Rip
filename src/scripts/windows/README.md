# Windows PowerShell Scripts

This directory contains PowerShell scripts for optical drive operations on Windows systems.

## Compatibility

- **Windows 8/Server 2012** and later
- Uses MCI (Media Control Interface) for drive operations
- Uses WMI (Windows Management Instrumentation) for drive detection

## Scripts

### `detect-drives.ps1`
**Purpose**: Detects all optical drives (CD/DVD/Blu-ray) on the system
**Returns**: JSON array of drive objects with device IDs, descriptions, and media types
**Usage**: Called automatically by the optical drive utility

### `eject-drive.ps1`
**Purpose**: Ejects/opens optical drive trays
**Parameters**: 
- `-DriveLetter` (optional): Specific drive letter to eject
**Usage**: Called automatically by the optical drive utility

### `load-drive.ps1`
**Purpose**: Loads/closes optical drive trays
**Parameters**: 
- `-DriveLetter` (optional): Specific drive letter to load
**Usage**: Called automatically by the optical drive utility

## Technical Details

### MCI Commands Used
- `set cdaudio door open` - Opens/ejects drive trays
- `set cdaudio door closed` - Closes/loads drive trays

### WMI Classes Used
- `Win32_LogicalDisk` (DriveType=5) - Optical drives with media
- `Win32_CDROMDrive` - All CD/DVD/Blu-ray drives

## Error Handling

All scripts include comprehensive error handling and return appropriate exit codes:
- **Exit 0**: Success
- **Exit 1**: Failure

## Security

Scripts are designed to run with minimal privileges and use `ExecutionPolicy Bypass` for reliable execution without requiring system-wide policy changes.