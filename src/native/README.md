# Native Optical Drive Module

This directory contains the native C++ Node.js addon for reliable optical drive operations on Windows.

## Overview

The native addon provides direct access to the Windows DeviceIoControl API for optical drive operations, ensuring reliable and fast optical drive control. Drive detection uses PowerShell WMI, while eject/load operations use native C++.

## Architecture

### C++ Implementation (`optical_drive.cpp`)

- **Direct Windows API Access**: Uses `DeviceIoControl` with `IOCTL_STORAGE_EJECT_MEDIA` and `IOCTL_STORAGE_LOAD_MEDIA`
- **Proper Device Handling**: Opens drives using `\\.\DriveLetter:` format as required by Windows API
- **Error Handling**: Returns boolean success/failure status
- **Memory Management**: Properly closes device handles to prevent resource leaks

### JavaScript Wrapper (`native-optical-drive.js`)

- **Lazy Loading**: Only loads the native addon when needed
- **Error Handling**: Provides clear error messages and logging
- **Cross-Platform Safety**: Only attempts to use native operations on Windows
- **ES Module Support**: Uses createRequire for compatibility with ES modules

### Drive Detection (`optical-drive.js`)

- **WMI Integration**: Uses PowerShell WMI queries for reliable optical drive detection
- **Native Operations**: All eject/load operations use the native C++ addon

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
4. **Module Load Error**: JavaScript wrapper throws descriptive errors

## Testing

Unit tests mock the native addon to ensure proper error handling without requiring actual hardware or compilation.

## Advantages of Hybrid Approach

1. **Accurate Detection**: PowerShell WMI provides reliable optical drive identification
2. **Fast Operations**: Native C++ operations are much faster than PowerShell for eject/load
3. **Best of Both**: Combines the strengths of both approaches
4. **Error Handling**: More precise error reporting from Windows API for operations
5. **Security**: Minimal external command usage, only for detection
