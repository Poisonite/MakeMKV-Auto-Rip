# Changelog

All notable changes to MakeMKV Auto Rip will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-11

### Added

- **Modern Web UI** - Complete graphical interface with real-time updates and responsive design
  - Interface accessible at `http://localhost:3000`
  - Real-time status updates via WebSocket connections
  - Live activity logs with auto-scrolling
  - Responsive design that works on desktop, tablet, and mobile
- **Interactive Operation Control** - Stop running operations from web UI
  - Dynamic button states that change from "Start" to "Stop" during operations
  - Graceful process termination with SIGTERM → SIGKILL fallback
  - Real-time status tracking with `canStop` property
  - Visual feedback with color-coded buttons on web UI
- **CLI Integration for Web UI** - Web UI uses actual CLI commands for reliability
  - All operations execute real CLI commands (`npm run start`, `npm run load`, `npm run eject`)
  - Future-proof: web UI automatically benefits from CLI updates
  - Real program output streaming to web interface
- **Advanced CLI Flags** - New command line options for automation
  - `--no-confirm` flag to bypass "Rip or Dip?" prompt for automated ripping
  - `--quiet` flag to reduce verbose startup messages for cleaner output
  - Perfect for web UI context, automated scripts, docker or headless deployments, etc
- **MakeMKV version checking and validation** - The application now automatically checks MakeMKV version compatibility and provides user-friendly error messages when the installed version is too old MakeMKV to allow ripping. It also reports the installed version and warns about available updates.
- **System Date Management** - Temporarily change system date for MakeMKV operations (restored to network time after program finishes)
  - Configure via web UI with intuitive date/time picker interface
  - Support for date-only (`2024-01-15`) or date-time (`2024-01-15 14:30:00`) formats
  - Cross-platform support: Windows, macOS, and Linux with native system commands
  - Automatic date restoration after ripping operations complete
  - Administrative privileges required for reliable system date modification
  - One-click "Clear Date" button for easy reset to real system date when using the web config editor
- **Automatic MakeMKV path detection** - The application now automatically detects the MakeMKV installation path across Windows, macOS, and Linux, greatly simplifying setup for users.
- **Refactored configuration loading and validation** - Configuration loading and validation now handles missing or invalid custom MakeMKV paths gracefully, falling back to automatic detection when necessary (an install path for MakeMKV is no longer required).
- **Documentation updates** - Documentation has been updated to reflect changes to configuration, including troubleshooting steps related to MakeMKV installation.
- **Complete project refactor** with proper Node.js project structure
- **Modular architecture** with clear separation of concerns into services, utilities, and CLI modules
- **Docker support** - Full Docker containerization with multi-platform compatibility
  - Dockerfile builds MakeMKV from source (v1.18.1) on Debian bookworm
  - Includes required Linux tools for optical drives (`udisks2`, `eject`, `udev`)
  - Runs Web UI by default, exposes port 3000, uses a non-root user (added to the cdrom group)
  - Volumes for media/logs, health checks, and proper permissions
  - Docker Compose with bind-mounted `config.yaml` and device mappings
  - Default compose service now uses the pre-built Docker Hub image; local build available via `build` profile
- **NPM package publishing** - Ready for npm registry distribution
  - Binary executable support (`makemkv-auto-rip` command)
  - Added Web UI binary (`makemkv-auto-rip-web`) for local installs
  - Proper package.json configuration for global installation
  - Development files excluded from published package
  - Optional dependencies for cross-platform compatibility
- **Cross-platform compatibility**
  - Docker environment detection
  - Comprehensive test coverage for Docker functionality and cross-platform behavior
  - Linux-compatible MakeMKV executable paths
- **Advanced drive management** - Separate configuration options for loading and ejecting drives
- **Flexible ripping modes** - Choose between async (parallel) or sync (sequential) ripping for optimal SSD or HDD performance
- **Enhanced logging** - Configurable 12hr/24hr time format options for console timestamps (defaults to 12hr)
- **Standalone drive commands** - `npm run load` and `npm run eject` for drive operations without ripping
- **Docker management commands** - Complete docker-compose workflow commands including `npm run docker:build`, `docker:run`, `docker:stop`, `docker:logs`, `docker:clean`, and `docker:rebuild` for clean-slate development
- **CI/CD automation**
  - GitHub Actions edge pipeline builds multi-arch Docker image on pushes to `master` and tags as `:edge`
  - Release pipeline on tags publishes npm (stable → `latest`, pre-release → `next`), Docker (stable → `latest`, pre-release → `next`), and creates GitHub Releases
  - Release notes are sourced from the matching section in `CHANGELOG.md`
  - Docker Hub repository README is kept in sync from this project's `README.md`
- **Parallel disc processing** - Multiple discs now rip simultaneously instead of sequentially (originally completed by @Adam8234 and @ThreeHats --- Thank you!!!)
- **Enhanced error handling** - Comprehensive error handling throughout the application
- **Improved logging** - Structured logging with consistent formatting and colors
- **Configuration validation** - Automatic validation of required configuration settings
- **Configurable drive loading delay** - Users can now set custom delay times for drive loading operations, with the ability to disable delays entirely. The wait is disabled by default (only needed if you're ripping with certain USB or laptop/slimline drives that lack a retract mechanism).
- **Cross-platform drive operations** - New optical drive utility supports Windows, macOS, and Linux for loading and ejecting optical drives without external dependencies
- **Hybrid Windows drive implementation** - PowerShell WMI for accurate drive detection, native C++ addon using DeviceIoControl API for eject/load operations
- **Mount detection and waiting** - Configurable wait and re-polling mechanism to prevent drives from being skipped due to slow OS media detection.
- **Windows uses 64 bit** - Windows OS now uses the 64 bit version of makemkvcon (makemkvcon64.exe). Other OSes don't have seperate 32 vs 64 bit versions.
- **Configurable repeat mode** - Users can now enable/disable repeat mode through configuration, allowing the application to exit after ripping instead of prompting again

### Changed

- **Documentation** - Main `README.md` now highlights Docker as the recommended path; `README-DOCKER.md` contains expanded details
- **Packaging** - `package.json` updated to include web assets and scripts in published package
- **Configuration format** - Migrated from JSON (`config/Default.json`) to YAML (`config.yaml`) for improved readability and easier editing
- **Configuration structure** - Reorganized into logical sections: `paths`, `drives`, `ripping`, etc for better organization
- **Path handling** - Cross-platform path normalization with support for forward slashes on all platforms (no more escaped backslashes!)
- **Configuration validation** - Enhanced validation with clearer error messages referencing `config.yaml`
- **Configuration drive options** - Split `ejectDVDs` into separate `loadDrives` and `ejectDrives` options for granular control
- **Ripping behavior options** - Added `rippingMode` option to choose between async/sync processing (defaults to async)
- **Logging system options** - Restructured the config options to a `logging` section with `timeFormat` option for 12hr/24hr console timestamps (defaults to 12hr)
- **Cross-platform executable paths** - MakeMKV executable path now adapts to Windows vs Linux vs macOS environments
- **All dependencies updated** - All project dependencies have been updated to their latest versions
- **Removed `moment` and `colors`** - Replaced with `date-fns` for date/time and `chalk` for colored output
- **Remove `config`** - Replaced with `yaml` to fit the new configuration style
- **Project now supports the latest Node.js LTS version** - Minimum required Node.js version raised to latest LTS (older versions may work, but are not officially supported)
- **Eliminated all batch files** - Replaced with comprehensive npm commands
- **Project structure** - Code organized into logical modules under `src/` directory
- **Entry point** - Now uses `index.js` as main entry point instead of `AutoRip.js`
- **Import system** - Updated to ES6 modules throughout
- **Configuration management** - Centralized YAML configuration handling with validation
- **User interface** - Improved CLI with better prompts and messaging

### Removed

- All `.bat` files (AutoRip.bat, DriveLoader.bat, Install-Node-Packages.bat)
- Monolithic `AutoRip.js` file (replaced with modular structure)
- **`win-eject` dependency** - Replaced with optical drive commands and custom Windows addon for cross-platform support

### Migration Notes

**Configuration Updates Required:**

- **Migrate from JSON to YAML:** Replace `config/Default.json` with `config.yaml`
- **New YAML format example can be found in the included `config.yaml` file AND in the README.MD**

- **Path format:** Use forward slashes (/) instead of escaped backslashes (\\) for all paths, regardless of system or platform

- **Docker:** We highly recommend running in a containerized environment for most use cases, consider migrating today! Our docker image maintains full feature parity _(except for faking the system time)_ with the standard program, defaults to the new Web UI, and helps manage MakeMKV itself on a deeper level.

---

## Legacy Versions (0.1.0 - 0.6.0) - Rewritten for clarity, formatting and brevity on 2025-07-21

### [0.6.0] - The Exterminator has Arrived

- **Added:** Support for Blu Ray Discs
- **Added:** Section to show failed items at the bottom
- **Changed:** Title selection code rewritten for wider disc compatibility
- **Changed:** Log generation creates new files instead of overwriting
- **Fixed:** "Following items were ripped" to only show non-failed items
- **Fixed:** DriveLoader.bat script running issues

### [0.5.2] - More accurate completed messages

- **Added:** Load.js for standalone DVD loading
- **Added:** Eject.js for standalone DVD ejection
- **Added:** DriveLoader.bat for drive management
- **Changed:** Message system to only show completion for successfully ripped discs

### [0.5.1] - Auto Eject

- **Fixed:** Disc ejecting problems from version 0.5.0

### [0.5.0] - A log for you, and a log for you, and a log for everyone!

- **Added:** Optional logging with configurable file paths
- **Added:** Optional automatic disc ejecting
- **Added:** win-eject module for disc management
- **Added:** Default Logs folder

### [0.4.2] - Colors, Colors, Everywhere!

- **Added:** Color support for console messages using "colors" module
- **Changed:** Default output path back to "C:\\"

### [0.4.1] - Git Optimization and Organizational Improvements

- **Added:** Install-Node-Packages.bat for easier dependency installation
- **Changed:** Reorganized code for better readability
- **Changed:** Node packages no longer download with repository

### [0.4.0] - The Synchronous Update

- **Changed:** DVDs now rip synchronously instead of asynchronously for better system performance
- **Fixed:** Updated config warning message to reflect new config file name

### [0.3.2] - Critical Patch for User Config

- **Fixed:** Config file loading (renamed from Config.json to Default.json)

### [0.3.1] - Critical Patch

- **Fixed:** Batch file running issue from version 0.3.0

### [0.3.0] - General Public Approved

- **Added:** Config.json for user configuration
- **Added:** Configuration for MakeMKV and movie rip directories
- **Added:** Warning about configuring Config.json before running
- **Changed:** Removed hard-coded directory paths
- **Changed:** Program now exits properly when run from batch file

### [0.2.1] - The first code-based update

- **Added:** AutoRip.bat for easier execution
- **Added:** Timestamps for all messages
- **Changed:** Enhanced title scrubbing for Windows folder name compatibility

### [0.1.0] - Initial Upload

- **Added:** Initial testing version (not publicly usable)
- **Added:** Basic DVD ripping functionality
