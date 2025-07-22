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
│   ├── services/                 # Business logic services
│   │   ├── disc.service.js       # Disc detection and analysis
│   │   ├── rip.service.js        # Ripping operations management
│   │   └── drive.service.js      # Drive loading/ejection operations
│   ├── utils/                    # Utility modules
│   │   ├── filesystem.js         # File system operations
│   │   ├── logger.js             # Logging and output formatting
│   │   └── validation.js         # Data validation utilities
│   ├── config/                   # Configuration management
│   │   └── index.js              # Centralized config handling
│   └── constants/                # Application constants
│       └── index.js              # Shared constants and enums
├── config/                       # Configuration files
│   └── default.json              # Application settings
├── .github/                      # GitHub templates and workflows
│   ├── ISSUE_TEMPLATE/           # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md  # Pull request template
├── package.json                  # Project metadata and dependencies
├── index.js                      # Application entry point
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
  - `getAvailableDiscs()` - Scans for inserted discs
  - `parseDriveInfo()` - Processes MakeMKV drive output
  - `getFileNumber()` - Identifies longest title on disc

#### RipService

- **Responsibility**: Orchestrates the ripping process
- **Key Features**:
  - Configurable parallel or sequential processing of multiple discs
  - Progress tracking and result aggregation
  - Error handling and recovery
  - Integration with logging and drive management
  - Support for async/sync ripping modes for optimal HDD performance

#### DriveService

- **Responsibility**: Physical drive operations
- **Key Methods**:
  - `loadAllDrives()` - Closes/loads all optical drives
  - `ejectAllDrives()` - Ejects all optical drives
  - `loadDrivesWithWait()` - Loads drives with user guidance
- **Configuration Integration**: 
  - Separate control for loading and ejecting operations
  - Independent enable/disable options for each drive operation

### Error Handling Strategy

The application implements a multi-layered error handling approach:

1. **Input Validation** - Configuration and user input validation
2. **Service-Level Errors** - Business logic error handling with graceful degradation
3. **System-Level Errors** - Global exception handlers for critical failures
4. **User Communication** - Clear, actionable error messages

## 🔄 Data Flow

### Ripping Process Flow

```
1. User Input (CLI) → 2. Configuration Validation → 3. Drive Loading (if enabled)
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
- **config** - Configuration file management
- **win-eject** - Windows optical drive control

### Development Principles

- **ES6+ Features** - Modern JavaScript syntax and features
- **Async/Await** - Promise-based asynchronous operations
- **Functional Programming** - Pure functions where possible
- **Immutable Patterns** - Avoiding side effects in utilities

## 📊 Performance Considerations

### Configurable Processing Modes

Thanks to contributions of @ThreeHats and @Adam8234, we support both parallel and sequential processing for multiple disc operations:

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

- **Async mode** reduces total ripping time when multiple drives are available
- **Sync mode** is ideal for HDDs where concurrent write streams significantly impact performance

### Memory Management

- **Streaming Operations** - Large MakeMKV outputs are processed in chunks
- **Garbage Collection** - Explicit cleanup of large data structures
- **Resource Pooling** - Reuse of validation and parsing logic

## 🔍 MakeMKV Integration

### Command Interface

The application interfaces with MakeMKV through its command-line tool (`makemkvcon.exe`):

```javascript
// Drive detection
makemkvcon -r info disc:index

// Title analysis
makemkvcon -r info disc:{driveNumber}

// Ripping operation
makemkvcon -r mkv disc:{driveNumber} {fileNumber} "{outputPath}"
```

### Output Parsing

MakeMKV output follows a structured format that the application parses:

- **Drive Information**: `DRV:` prefix with comma-separated values
- **Title Information**: `TINFO:` prefix with metadata
- **Completion Status**: `MSG:5036` or "Copy complete" indicators

## 🎯 Migration from v0.6.0

### Breaking Changes

1. **Entry Point**: `AutoRip.js` → `index.js`
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

## 🔮 Future Considerations

### Recent Enhancements (V1.0.0)

1. **Granular Drive Control** - Split drive operations into separate load/eject configuration options
2. **Performance Optimization** - Added sync/async ripping modes for HDD optimization
3. **Enhanced Logging** - Configurable 12hr/24hr time format options

### Potential Future Enhancements

1. **Cross-Platform Support** - Linux and macOS compatibility
2. **Metadata Integration** - Automatic movie information lookup (renaming to match Plex conventions)
   ... TBD

### Technical Debt

1. **Testing Coverage** - Unit and integration tests needed
2. **Documentation** - JSDoc coverage for all modules
3. **Configuration Schema** - JSON schema validation

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
