# Native Optical Drive Module

This directory contains the native C++ Node.js addon for reliable optical drive operations on Windows.

## Overview

The native addon provides direct access to the Windows DeviceIoControl API for optical drive operations, eliminating the reliability issues associated with PowerShell execution policies and complex command strings.

## Architecture

### C++ Implementation (`optical_drive.cpp`)
- **Direct Windows API Access**: Uses `DeviceIoControl` with `IOCTL_STORAGE_EJECT_MEDIA` and `IOCTL_STORAGE_LOAD_MEDIA`
- **Proper Device Handling**: Opens drives using `\\.\DriveLetter:` format as required by Windows API
- **Error Handling**: Returns boolean success/failure status
- **Memory Management**: Properly closes device handles to prevent resource leaks

### JavaScript Wrapper (`native-optical-drive.js`)
- **Lazy Loading**: Only loads the native addon when needed
- **Graceful Fallback**: Falls back to PowerShell if native addon isn't available
- **Error Handling**: Provides clear error messages and logging
- **Cross-Platform Safety**: Only attempts to use native operations on Windows

## Windows API Details

### Device Access
```cpp
HANDLE hDevice = CreateFileW(
    L"\\\\.\\" + driveLetter,  // Must use \\.\D: format
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    NULL,
    OPEN_EXISTING,
    0,
    NULL
);
```

### Drive Operations
```cpp
// Eject
DeviceIoControl(hDevice, IOCTL_STORAGE_EJECT_MEDIA, ...);

// Load/Close
DeviceIoControl(hDevice, IOCTL_STORAGE_LOAD_MEDIA, ...);
```

## Compatibility

- **Windows 8/Server 2012** and later
- All versions include the required DeviceIoControl API
- Works with all optical drive types (CD, DVD, Blu-ray)

## Building

The addon is built automatically during `npm install` using node-gyp:

```bash
npm run build          # Build release version
npm run build:debug    # Build debug version
npm run clean          # Clean build artifacts
```

## Dependencies

- **node-addon-api**: Modern C++ wrapper for Node.js addons
- **node-gyp**: Build system for native Node.js modules
- **Windows SDK**: Required for Windows API headers

## Error Handling

The native addon handles several error conditions:

1. **Device Access Denied**: Returns false if drive cannot be opened
2. **Invalid Drive Letter**: Returns false for non-existent drives
3. **Operation Failed**: Returns false if DeviceIoControl fails
4. **Module Load Error**: JavaScript wrapper falls back to PowerShell

## Testing

Unit tests mock the native addon to ensure proper error handling and fallback behavior without requiring actual hardware or compilation.

## Advantages Over PowerShell

1. **Reliability**: No PowerShell execution policy issues
2. **Performance**: Direct API calls are faster than spawning PowerShell processes
3. **Error Handling**: More precise error reporting from Windows API
4. **Security**: No script execution or command injection risks
5. **Maintenance**: No complex PowerShell string escaping or syntax issues