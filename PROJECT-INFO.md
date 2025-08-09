# Project Information

This document provides technical details about the MakeMKV Auto Rip project architecture, design decisions, and background information that's not essential for setup and usage.

## 🏗️ Architecture Overview

MakeMKV Auto Rip v1.0.0 represents a complete architectural overhaul from the original monolithic design to a modern, modular Node.js application.

### Project Structure

```
├── src/                          # Source code
│   ├── cli/                      # Command-line interface modules
│   │   ├── interface.js          # Main interactive interface
│   │   └── commands.js           # Standalone drive commands
│   ├── web/                      # Web interface components
│   │   ├── web.service.js        # Express server and WebSocket management
│   │   ├── routes/
│   │   │   └── api.routes.js     # REST API endpoints
│   │   ├── middleware/
│   │   │   └── websocket.middleware.js  # Real-time communication
│   │   └── static/               # Frontend assets
│   │       ├── css/
│   │       │   └── styles.css    # Responsive styling
│   │       └── js/
│   │           └── app.js        # Frontend JavaScript
│   ├── services/                 # Business logic services
│   │   ├── disc.service.js       # Disc detection and analysis
│   │   ├── rip.service.js        # Ripping operations management
│   │   └── drive.service.js      # Drive loading/ejection operations
│   ├── utils/                    # Utility modules
│   │   ├── filesystem.js         # File system operations
│   │   ├── logger.js             # Logging and output formatting
│   │   ├── makemkv-messages.js   # MakeMKV output message parsing and version checking
│   │   └── validation.js         # Data validation utilities
│   ├── config/                   # Configuration management
│   │   └── index.js              # Centralized config handling
│   └── constants/                # Application constants
│       └── index.js              # Shared constants and enums
├── scripts/                      # Build and utility scripts
│   └── postinstall.js            # Post-installation verification script
├── public/                       # Web UI static files
│   ├── index.html                # Main web interface
│   └── config.html               # Configuration UI
├── config.yaml                   # YAML configuration file for application settings
├── Dockerfile                    # Docker image definition
├── docker-compose.yaml           # Docker Compose deployment
├── .dockerignore                 # Docker build exclusions
├── web.js                        # Web UI entry point
├── .github/                      # GitHub templates and workflows
│   ├── ISSUE_TEMPLATE/           # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md  # Pull request template
│   └── workflows/
│       └── docker.yaml           # CI to build and publish Docker images
├── package.json                  # Project metadata and dependencies
├── index.js                      # CLI application entry point
├── README.md                     # Main documentation
├── PROJECT-INFO.md               # Technical architecture details
├── CONTRIBUTING.md               # Contributing guidelines
└── CHANGELOG.md                  # Version history
```

## 🔧 Design Patterns and Principles

### Separation of Concerns

The application follows strict separation of concerns:

- **CLI Layer** (`src/cli/`) - User interaction and input/output handling
- **Service Layer** (`src/services/`) - Business logic and external system integration
- **Utility Layer** (`src/utils/`) - Reusable helper functions and utilities
- **Configuration Layer** (`src/config/`) - Settings management and validation

### Service-Oriented Architecture

#### DiscService

- **Responsibility**: Disc detection, drive enumeration, and title analysis
- **Key Methods**:
  - `getAvailableDiscs()` - Scans for inserted discs with mount detection wait
  - `waitForDriveMount()` - Waits for drives to mount media (configurable timeout)
  - `detectAvailableDiscs()` - Fast disc detection without file processing
  - `getCompleteDiscInfo()` - Processes complete disc information including file numbers
  - `parseDriveInfo()` - Processes MakeMKV drive output
  - `getDiscFileInfo()` - Identifies longest title on disc
- **Mount Detection**: Automatically waits for slow-mounting drives to prevent drives from being skipped due to OS mount delays

#### RipService

- **Responsibility**: Orchestrates the ripping process
- **Key Features**:
  - Configurable parallel or sequential processing of multiple discs
  - Progress tracking and result aggregation
  - Error handling and recovery
  - Integration with logging and drive management
  - Support for async/sync ripping modes for optimal SSD/HDD performance

#### DriveService

- **Responsibility**: Physical drive operations and drive status monitoring
- **Key Methods**:
  - `loadAllDrives()` - Closes/loads all optical drives
  - `ejectAllDrives()` - Ejects all optical drives
  - `loadDrivesWithWait()` - Loads drives with configurable delay and user guidance
  - `getDriveMountStatus()` - Monitors drive mount status using MakeMKV to detect mounted/unmounted drives
- **Configuration Integration**:
  - Separate control for loading and ejecting operations
  - Independent enable/disable options for each drive operation
  - Configurable delay time for drive loading operations
- **Mount Status Detection**: Uses MakeMKV drive state analysis to identify drives that are still mounting media vs. those that are ready for ripping

### Optical Drive Management Architecture

The optical drive management system provides cross-platform drive control with platform-specific optimizations:

#### Cross-Platform Support

- **Windows**: Native C++ addon using DeviceIoControl API
- **macOS**: Uses `drutil` command-line utility
- **Linux**: Uses `eject` command and `/sys/block` filesystem

#### Windows Native Implementation

- **Technology**: Node.js C++ addon with N-API
- **API**: Windows DeviceIoControl with `IOCTL_STORAGE_EJECT_MEDIA` / `IOCTL_STORAGE_LOAD_MEDIA`
- **Detection**: PowerShell WMI queries (`Win32_CDROMDrive`)
- **Distribution**: Pre-built binary included in repository
- **Requirements**: Administrator privileges for hardware access

#### Implementation Details

```
Detection (All Platforms) → Platform Router → Native Implementation
        ↓                         ↓                      ↓
   WMI/lsblk/diskutil     OpticalDriveUtil    Windows: DeviceIoControl
                                              macOS:   drutil commands
                                              Linux:   eject/filesystem
```

### Interface Behavior Configuration

The application supports configurable interface behavior to adapt to different user workflows:

#### Repeat Mode

- **Configuration**: `interface.repeat_mode` (default: `true`)
- **Behavior**: Controls whether the application prompts for additional ripping operations after completing a rip
- **Use Cases**:
  - `true`: Batch processing multiple discs without restarting the application
  - `false`: Single-rip operations that exit after completion

#### Drive Loading Delay

- **Configuration**: `drives.load_delay` (default: `0`)
- **Behavior**: Configurable delay time after loading drives to allow for manual drive closing
- **Use Cases**:
  - `0`: No delay, immediate progression to ripping
  - `> 0`: Custom delay for drives that require manual intervention

### Error Handling Strategy

The application implements a multi-layered error handling approach:

1. **Input Validation** - Configuration and user input validation
2. **Service-Level Errors** - Business logic error handling with graceful degradation
3. **System-Level Errors** - Global exception handlers for critical failures
4. **User Communication** - Clear, actionable error messages

## 🔄 Data Flow

### Ripping Process Flow

```
1. User Input (CLI) → 2. YAML Configuration Validation → 3. Drive Loading (if enabled)
                                    ↓
8. Results Display ← 7. Drive Ejection (if enabled) ← 6. Configurable Ripping ← 5. Disc Detection
                                    ↓                        (Async/Sync)              ↓
                                                                            4. Title Analysis
```

### Command Processing

```
npm start → index.js → CLIInterface → RipService → DiscService + DriveService
npm run load → commands.js → DriveService.loadDrivesWithWait()
npm run eject → commands.js → DriveService.ejectAllDrives()
```

## 🛠️ Technology Stack

### Core Dependencies

- **Node.js (ES Modules)** - Runtime environment with modern import/export syntax
- **chalk** - Terminal styling and colors
- **date-fns** - Modern date/time formatting (replaced moment.js)
- **yaml** - YAML configuration file parsing and management

### Web UI Dependencies

- **Express** - Web server framework for API and static file serving
- **WebSocket (ws)** - Real-time bidirectional communication
- **Multer** - File upload handling for configuration management
- **Vite** - Lightning-fast frontend build tool and dev server
- **Vanilla JavaScript** - No frontend framework dependencies for maximum performance

### Native Components

- **Windows C++ Addon** - Pre-built native Node.js addon for Windows optical drive control
  - Uses Windows DeviceIoControl API for direct hardware access
  - Requires administrator privileges for optimal functionality
  - Included as pre-built binary (no compilation required)
  - Cross-platform support for macOS/Linux using system utilities

### Container Technology

- **Docker** - Application containerization with Debian (bookworm) base
- **Docker Compose** - Multi-container application orchestration
- **Health Checks** - Container monitoring and recovery
- **Volume Mounting** - Persistent data and media storage

### Cross-Platform Support

- **Environment Detection** - Automatic platform-specific behavior
- **Conditional Imports** - Dynamic loading of platform-specific modules
- **Path Adaptation** - Cross-platform file system handling
- **Executable Resolution** - Platform-appropriate binary paths

### Development Principles

- **ES6+ Features** - Modern JavaScript syntax and features
- **Async/Await** - Promise-based asynchronous operations
- **Functional Programming** - Pure functions where possible
- **Immutable Patterns** - Avoiding side effects in utilities
- **Platform Agnostic** - Cross-platform compatibility by design

## 📊 Performance Considerations

### Configurable Processing Modes

We support both parallel and sequential processing for multiple disc operations:
(Thanks to the contributions of @ThreeHats and @Adam8234 for the original parallel processing logic)

### Mount Detection Configuration

The application includes configurable mount detection to prevent drives from being skipped:

- **`mount_detection.wait_timeout`** - Maximum time (in seconds) to wait for drives to mount media
- **`mount_detection.poll_interval`** - Polling interval (in seconds) to check for newly mounted drives
- **Default Values**: 10 seconds timeout, 1 second poll interval
- **Behavior**: When drives are detected but no media is loaded, the system will poll them for the configured duration to allow for slow OS media detection
- **Architecture**: Uses fast disc detection during polling to avoid expensive file processing operations, only processing complete disc title information after all drives are confirmed mounted

### Processing Modes

**Async Mode (Parallel - Default):**

```javascript
const promises = discs.map((disc) => ripDisc(disc));
await Promise.all(promises);
```

**Sync Mode (Sequential):**

```javascript
for (const disc of discs) {
  await ripDisc(disc);
}
```

- **Async mode** reduces total ripping time when writing to solid state storage (like a SSD)
- **Sync mode** is ideal for HDDs where concurrent write streams significantly impact performance

### Memory Management

- **Streaming Operations** - Large MakeMKV outputs are processed in chunks
- **Garbage Collection** - Explicit cleanup of large data structures
- **Resource Pooling** - Reuse of validation and parsing logic

## 🔍 MakeMKV Integration

### Command Interface

The application interfaces with MakeMKV through its command-line tool (`makemkvcon.exe` / `makemkvcon`):

**Windows:**

```javascript
"C:\Program Files (x86)\MakeMKV\makemkvcon64.exe";
```

**Docker/Linux/macOS:**

```javascript
makemkvcon; // Available in PATH within container
```

**Common Commands:**

```javascript
// Drive detection
makemkvcon -r info disc:index

// Title analysis
makemkvcon -r info disc:{driveNumber}

// Ripping operation
makemkvcon -r mkv disc:{driveNumber} {fileNumber} "{outputPath}"
```

### Version Checking and Validation

The application includes comprehensive MakeMKV version checking to ensure compatibility:

#### Version Validation

- **Critical Error Detection**: Automatically detects when MakeMKV version is too old for MakeMKV to allow ripping
- **Graceful Failure**: Stops all operations with clear error message when version is incompatible
- **Cross-Service Integration**: Version checking integrated into all MakeMKV command executions

#### Version Reporting

- **First-Run Detection**: Reports installed MakeMKV version on first command execution
- **Update Notifications**: Warns users when newer versions are available
- **User-Friendly Messages**: Clear, actionable messages for version-related issues

#### Implementation Details

```javascript
// Version checking utility
MakeMKVMessages.checkOutput(output, isFirstCall);

// Message codes handled
MAKEMKV_VERSION_MESSAGES = {
  VERSION_INFO: "MSG:1005", // Version information
  VERSION_TOO_OLD: "MSG:5021", // Version too old error
  UPDATE_AVAILABLE: "MSG:5075", // Update available warning
};
```

### Output Parsing

MakeMKV output follows a structured format that the application parses:

- **Drive Information**: `DRV:` prefix with comma-separated values
- **Title Information**: `TINFO:` prefix with metadata
- **Completion Status**: `MSG:5036` or "Copy complete" indicators
- **Version Messages**: `MSG:1005`, `MSG:5021`, `MSG:5075` for version-related information

## 🎯 Migration from v0.6.0

### Breaking Changes

1. **Entry Point**: `AutoRip.js` → `index.js` (or `web.js`, to run `index.js` via a graphical browser instead)
2. **Execution**: Batch files → npm scripts
3. **Structure**: Monolithic → Modular
4. **Imports**: CommonJS → ES Modules
5. **Versions**: Updated package and platform version requirements

### Preserved Functionality

- All configuration options maintain backward compatibility
- User experience remains familiar
- Output folder structure unchanged
- MakeMKV integration unchanged

### Improvement Benefits

- **Maintainability**: Easier to understand, modify, and extend
- **Testability**: Isolated modules enable unit testing
- **Reliability**: Better error handling and recovery
- **Performance**: Parallel processing and optimized resource usage

## 🌐 Web UI Architecture

### Dual Interface Design

The application supports both CLI and Web UI interfaces:

- **CLI Interface**: Traditional command-line experience with interactive prompts & detailed logging
- **Web UI**: Modern graphical interface with real-time updates and responsive design

### Web UI Features

- **Real-time Communication**: WebSocket-based status updates and log streaming
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Interactive Control**: Dynamic buttons that change from "Start" to "Stop" during operations
- **Clean Integration**: Uses actual CLI commands for reliability and future-proofing

### Technology Choices

- **Vite + Express + WebSocket**: Vite is used for lightning-fast frontend development and hot module reloading, while Express and WebSocket provide a lightweight, performant backend with real-time capabilities.
- **Vanilla JavaScript**: No frontend framework dependencies for maximum performance and simplicity.
- **CLI Integration**: Web UI executes real CLI commands for reliability.

## 🐳 Docker Architecture

### Container Design

The Docker implementation follows best practices for Node.js containerization:

```dockerfile
# Multi-stage build with Linux base
FROM node:22-bookworm

# Security: Non-root user execution
USER makemkv (uid: 1001)

# Volumes: Separate data from application
VOLUME ["/app/media", "/app/logs"]

# Health checks: Container monitoring
HEALTHCHECK --interval=30s --timeout=10s
```

### Container Features

- **MakeMKV Integration** - Pre-installed MakeMKV console tools
- **Volume Management** - Persistent media and log storage
- **Device Access** - Optical drive mounting with proper permissions
- **Environment Variables** - Configuration through Docker environment
- **Health Monitoring** - Built-in container health checks

### Docker Compose Configuration

```yaml
services:
  makemkv-auto-rip:
    build:
      context: .
      args:
        MAKEMKV_VERSION: 1.18.1
    ports:
      - "3000:3000"
    devices:
      - /dev/sr0:/dev/sr0:ro
    volumes:
      - ./media:/app/media
      - ./logs:/app/logs
      - ./config.yaml:/app/config.yaml
    privileged: true
```

## 🔮 Future Considerations

### Potential Future Enhancements

1. **macOS Native Support** - Native drive operations for macOS
2. **Metadata Integration** - Automatic movie information lookup (renaming to match Plex conventions)
3. **Kubernetes Support** - Scalable container orchestration
   ... TBD

### Technical Debt

1. **Testing Coverage** - Docker-specific integration tests needed
2. **Documentation** - Container deployment guides

## 📝 Code Style and Standards

### Naming Conventions

- **Files**: kebab-case (`disc.service.js`)
- **Classes**: PascalCase (`DiscService`)
- **Functions**: camelCase (`getAvailableDiscs`)
- **Constants**: UPPER_SNAKE_CASE (`MEDIA_TYPES`)

### Documentation Standards

- **JSDoc**: All public methods documented
- **README**: User-focused documentation
- **Comments**: Complex logic explained inline
- **Examples**: Usage examples in documentation

### Quality Metrics

- **Modularity**: Single responsibility principle
- **Coupling**: Loose coupling between modules
- **Cohesion**: High cohesion within modules
- **Readability**: Self-documenting code with clear naming
