# MakeMKV Auto Rip

Automatically rips DVDs and Blu-ray discs using the MakeMKV console and saves them to unique folders.

[![Build Status](https://img.shields.io/github/actions/workflow/status/Poisonite/MakeMKV-Auto-Rip/docker.yaml?branch=master&label=build&logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/actions/workflows/docker.yaml) [![Test Status](https://img.shields.io/github/actions/workflow/status/Poisonite/MakeMKV-Auto-Rip/test.yaml?branch=master&label=tests&logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/actions/workflows/test.yaml) [![Testing Framework](https://img.shields.io/badge/testing-vitest-646CFF?logo=vitest)](https://vitest.dev/) [![Coverage](https://codecov.io/github/Poisonite/MakeMKV-Auto-Rip/graph/badge.svg?token=1FUIIN3X87)](https://codecov.io/github/Poisonite/MakeMKV-Auto-Rip)

[![Release Workflow](https://img.shields.io/github/actions/workflow/status/Poisonite/MakeMKV-Auto-Rip/release.yaml?label=release&logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/actions/workflows/release.yaml) [![NPM Version](https://img.shields.io/npm/v/makemkv-auto-rip?logo=npm)](https://www.npmjs.com/package/makemkv-auto-rip) [![NPM Downloads](https://img.shields.io/npm/dm/makemkv-auto-rip?logo=npm)](https://www.npmjs.com/package/makemkv-auto-rip) [![Docker Image Version](https://img.shields.io/docker/v/poisonite/makemkv-auto-rip?label=docker&logo=docker)](https://hub.docker.com/r/poisonite/makemkv-auto-rip) [![Docker Pulls](https://img.shields.io/docker/pulls/poisonite/makemkv-auto-rip?logo=docker)](https://hub.docker.com/r/poisonite/makemkv-auto-rip)

[![GitHub Release](https://img.shields.io/github/v/release/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/releases/latest) [![Release Date](https://img.shields.io/github/release-date/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/releases/latest) [![Last Commit](https://img.shields.io/github/last-commit/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/commits/master) [![Commit Activity](https://img.shields.io/github/commit-activity/m/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/graphs/commit-activity)

[![Open Issues](https://img.shields.io/github/issues/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/issues) [![Open Pull Requests](https://img.shields.io/github/issues-pr/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/pulls) [![Contributors](https://img.shields.io/github/contributors/Poisonite/MakeMKV-Auto-Rip?logo=github)](https://github.com/Poisonite/MakeMKV-Auto-Rip/graphs/contributors) [![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](https://github.com/Poisonite/MakeMKV-Auto-Rip/blob/master/LICENSE.md)

[![Supported OS](https://img.shields.io/badge/OS-Windows%20%7C%20Linux%20%7C%20macOS-blue?logo=windows&logoColor=white)](https://github.com/Poisonite/MakeMKV-Auto-Rip#cross-platform-support) [![Docker Architectures](https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?logo=docker)](https://hub.docker.com/r/poisonite/makemkv-auto-rip) [![Docker Image Size](https://img.shields.io/docker/image-size/poisonite/makemkv-auto-rip?logo=docker)](https://hub.docker.com/r/poisonite/makemkv-auto-rip) [![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?logo=node.js)](https://nodejs.org/) [![Module Type](https://img.shields.io/badge/Module-ESM-F7DF1E?logo=javascript)](https://nodejs.org/api/esm.html)

## ✨ Features

- **🖥️ Interactive CLI** - Simple menu-driven interface
- **🌐 Modern Web UI** - Beautiful graphical interface with real-time updates
- **💿 Multi-format support** - DVDs and Blu-ray discs
- **🔍 Smart title detection** - Automatically finds the main movie
- **📁 Unique folders** - No file conflicts with automatic folder naming
- **📊 Flexible processing** - Choose between parallel (async) or sequential (sync) ripping
- **📝 Comprehensive logging** - Optional detailed operation logs with configurable 12hr/24hr console timestamps
- **⚡ Advanced drive management** - Separate control for loading and ejecting drive preferences
- **🎛️ Flexible options** - Rip longest title or all titles (that are above MakeMKV min title length)

## 🚀 Quick Start

### Recommended: Docker (Web UI)

Run with Docker for the simplest, fully self-contained setup.

1. Install Docker & Docker Compose
2. Create output directories:

   ```bash
   mkdir -p media logs
   ```

3. Start the container (using docker-compose.yaml in this repo):

   ```bash
   docker compose up -d
   ```

   For local development/building from source:

   ```bash
   npm run docker:build && npm run docker:run
   ```

4. Open the Web UI:

   [http://localhost:3000](http://localhost:3000)

Notes:

- Edit `config.yaml` locally; it’s bind-mounted into the container and can be edited from the Web UI.
- Map your optical drives under `devices:` (e.g., `/dev/sr0:/dev/sr0:ro`).
- See the full Docker guide: [README-DOCKER.md](README-DOCKER.md)

### Docker: MakeMKV License & Settings

You can run in trial mode (no key) or provide your key via environment variables. The container entrypoint writes values to `~/.MakeMKV/settings.conf`.

- Put values in a `.env` next to `docker-compose.yaml`:

  ```env
  MAKEMKV_APP_KEY=AAAA-BBBB-CCCC-DDDD-EEEE-FFFF
  # Optional tunables (defaults shown)
  MAKEMKV_MIN_TITLE_LENGTH=1000
  MAKEMKV_IO_ERROR_RETRY_COUNT=10
  ```

- Or use a key file:

  ```yaml
  environment:
    MAKEMKV_APP_KEY_FILE: /run/secrets/makemkv_key
  volumes:
    - ./makemkv_key.txt:/run/secrets/makemkv_key:ro
  ```

If you omit both, trial mode is used automatically.

---

### Web Interface (Standard Install)

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure the application:**
   Edit `config.yaml` with your paths

3. **Start the web UI:**

   ```bash
   npm run web
   ```

4. **Open your browser and go to:**  
   [http://localhost:3000](http://localhost:3000)

---

### Command Line Interface (CLI)

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure the application:**
   Edit `config.yaml` with your paths

3. **Start the CLI interface:**

   ```bash
   npm start
   ```

## 📋 Requirements

### Essential Software

1. **[MakeMKV](https://www.makemkv.com/)** - Required for all ripping operations
   - Each new version of Auto Rip is only tested with the most recent MakeMKV version
   - MakeMKV is bundled in our docker image, but it must be downloaded and installed separately for all other systems and install methods
2. **[Node.js](https://nodejs.org/)** - Runtime environment
   - Latest LTS recommended
     - Only >= v22 officially tested -others are likely to work back to (at least) v16
3. **Cross-platform OS support** - Works on Windows, macOS, and Linux
   - Only (officially) tested on Windows 10/11 & Debian/Ubuntu Linux

### Cross-Platform Support

- **Automatic MakeMKV Detection** - Finds MakeMKV installation automatically on Windows, Linux, and macOS
- **Manual makemkvcon Override** - Configure custom MakeMKV path in `config.yaml` if needed
- **Optical Drive Management** - Drive load/eject operations work on Windows, macOS, and Linux
- **Windows implementation** - Uses native C++ addon for reliable Windows DeviceIoControl API access
  - No compilation required, native addon included in repository
  - Run terminal as administrator for drive operations (Windows only)
- **No Python or other build tools required** - Ready to use out of the box (just `npm install`)

## 🛠️ Installation

1. **Download this repository**
2. **Install Node.js** from [nodejs.org](https://nodejs.org/)
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Configure the application** (see Configuration section below)
5. **Configure MakeMKV GUI** (see MakeMKV Configuration section below)

### Linux Drive Management Setup _(Optional)_

**Note: Only required for Linux users who want to use automatic drive ejecting**

If you encounter errors related to ejecting drives or receive sudo/admin prompts when inserting/ejecting discs, follow these steps:

1. **Add your user to the cdrom group:**

   ```bash
   sudo usermod -aG cdrom $USER
   ```

2. **Create a polkit rule for passwordless optical drive operations:**

   ```bash
   sudo nano /etc/polkit-1/rules.d/70-udisks2-no-password.rules
   ```

3. **Add the following content to the file:**

   ```javascript
   polkit.addRule(function (action, subject) {
     if (
       subject.isInGroup("cdrom") &&
       action.id.startsWith("org.freedesktop.udisks2.")
     ) {
       return polkit.Result.YES;
     }
   });
   ```

4. **Reboot your system:**
   ```bash
   sudo reboot
   ```
   This configuration allows users in the cdrom group to perform optical drive operations without requiring sudo passwords.

## ⚙️ Configuration

### Application Configuration (`config.yaml`)

```yaml
# MakeMKV Auto Rip Configuration
# This file contains all configuration settings for the application
# Paths are automatically normalized for the current operating system

# Application paths and directories
paths:
  # MakeMKV installation directory (OPTIONAL - auto-detected if not specified)
  # Uncomment and set only if you need to override the automatic detection
  # makemkv_dir: "C:/Program Files (x86)/MakeMKV"

  # Directory where ripped movies will be saved
  movie_rips_dir: "C:/Your/Movie/Rips"

  # Logging configuration
  logging:
    # Whether to save logs to files (true/false)
    enabled: true

    # Directory where log files will be saved
    dir: "C:/Your/Log/Directory"

    # Time format for log timestamps (12hr/24hr)
    time_format: "12hr"

# Drive operation settings
drives:
  # Automatically load/mount optical drives (true/false)
  auto_load: true

  # Automatically eject drives after ripping (true/false)
  auto_eject: true

  # Delay time when loading drives (in seconds) - allows time for manual drive closing if needed - 0 to disable
  load_delay: 0

# Ripping behavior settings
ripping:
  # Rip all titles from disc instead of just the main title (true/false)
  rip_all_titles: false

  # Ripping mode - async for parallel processing, sync for sequential (async/sync)
  mode: "async"

# Mount detection settings
mount_detection:
  # Maximum time to wait for drives to mount media before starting rip (in seconds) - 0 to disable
  wait_timeout: 10

  # Polling interval to check for newly mounted drives (in seconds)
  poll_interval: 1

# Interface behavior settings
interface:
  # Enable repeat mode - after ripping, prompt again for another round (true/false)
  repeat_mode: true

# MakeMKV behavior settings
makemkv:
  # Temporarily change system date for MakeMKV operations (leave blank to use real system date)
  # Supports date only: "2024-01-15" or date with time: "2024-01-15 14:30:00"
  # System date is automatically restored after ripping operations complete
  # NOTE: Requires administrative privileges (Run as Administrator on Windows, sudo on Linux/macOS)
  # WARNING: Not supported in Docker containers - change host system date manually if needed
  fake_date: ""
```

#### Configuration Options

- **`paths.makemkv_dir`** - MakeMKV installation directory (OPTIONAL - auto-detected if not specified)
  - Supports forward slashes on all platforms
  - For Advanced Users: Only needed if MakeMKV is installed in a non-standard location
- **`paths.movie_rips_dir`** - Root directory for ripped movies (create a dedicated folder)
- **`paths.logging.enabled`** - Enable/disable writing MakeMKV output to log files (`true` or `false`)
- **`paths.logging.dir`** - Directory for log files
- **`paths.logging.time_format`** - Time format for console/terminal timestamps (`"12hr"` or `"24hr"`)
- **`drives.auto_load`** - Auto-load/close drives before ripping (`true` or `false`)
- **`drives.auto_eject`** - Auto-eject drives after ripping completion (`true` or `false`)
- **`drives.load_delay`** - Delay time (in seconds) when loading drives, allows time for manual drive closing (`0` to disable, default: `0`)
- **`ripping.rip_all_titles`** - Rip all titles that are above MakeMKV min length (`true`) or longest title only (`false`)
- **`ripping.mode`** - Ripping mode (`"async"` for parallel processing or `"sync"` for sequential processing)
- **`mount_detection.wait_timeout`** - Maximum time (in seconds) to wait for drives to mount media before starting rip (`0` to disable, default: `10`)
- **`mount_detection.poll_interval`** - Polling interval (in seconds) to check for newly mounted drives (default: `1`)
- **`interface.repeat_mode`** - Enable repeat mode to prompt again after ripping (`true` or `false`, default: `true`)
- **`makemkv.fake_date`** - Temporarily change system date for MakeMKV operations
  - Format: `"2024-01-15"` (date only) or `"2024-01-15 14:30:00"` (date with time)
  - Leave blank (`""`) to use real system date
  - ⚠️ **Requirements**: Requires administrative privileges:
    - **Windows**: Run as Administrator
    - **Linux/macOS**: Run with sudo or as root
  - **Cross-Platform Support**: Works on Windows, macOS, and Linux
  - **Automatic Restoration**: System date automatically restored after ripping operations
  - ⚠️ **Docker Limitation**: Not supported in Docker containers - change host system date manually if needed

**Important Notes:**

- Recommended: Create dedicated folders for movie rips and logs
- **Performance tip**: Use `"sync"` ripping mode for HDD destinations where concurrent writes impact performance. For SSDs, `"async"` will yield much better overall performance.
- **Mount detection**: The mount detection feature prevents drives from being skipped due to slow OS media detection, especially beneficial on older hardware. Set `wait_timeout: 0` to disable this feature.

### MakeMKV GUI Configuration

Before using MakeMKV Auto Rip, configure the MakeMKV GUI:

1. **View → Preferences → Video**

   - Set "Minimum title length (seconds)" to a value below 1000
     - Other settings work, but this will yield the best results (i.e. not skipping real titles, but improving speed by skipping empty or useless clips)

2. **View → Preferences → IO**

   - Set "Read retry count" to 10 (helps with damaged/scratched discs)

3. **View → Preferences → Language**

   - Set interface and preferred languages for subtitles/audio
   - Select "auto" and "none" to include all audio and subtitle tracks

4. **Troubleshooting Blu-ray discs:**
   - Run at least one Blu-ray through the MakeMKV GUI first
   - Enter a valid key (beta key works - but please support the MakeMKV team if you find their software useful or time-saving!) before using Auto Rip

## 🎯 Usage

### Web Interface

```bash
npm run web        # Start web UI at http://localhost:3000
```

### Command Line Interface

```bash
npm start          # Interactive ripping interface
npm run load       # ONLY load/close all drives
npm run eject      # ONLY eject/open all drives
```

### Advanced CLI Options

```bash
npm start -- --no-confirm --quiet    # Skip prompts, reduce logging output
npm run load -- --quiet              # ONLY Load drives, and with minimal output
npm run eject -- --quiet             # ONLY Eject drives, and with minimal output
```

## 🔧 Troubleshooting

### Common Issues

1. **"Failed to start application" error**

   - Check that all paths in `config.yaml` exist and ALWAYS use forward slashes (/)
   - Ensure MakeMKV is properly installed (try running a disc with the GUI to confirm)

2. **"(Windows) Native optical drive addon failed to load" error**

   - This indicates a corrupted installation or missing native components
   - Try reinstalling the application: `npm install` - or building native addon from scratch `npm run windows-addons:build`
   - Ensure you're running on a supported Windows version (Windows 10/11 officially tested - _theoretically_ compatible back to ~Windows 2000)

3. **Drive eject/load operations fail**

   - **Windows: Run as administrator** - Right-click terminal and "Run as administrator"
     - Windows drive operations require elevated privileges for DeviceIoControl API access
   - macOS/Linux: Standard user privileges should work for most drives (See Linux troubleshooting section above)
   - Manual drive operation may be needed if software control isn't supported by hardware (or hardware lacks the proper physical mechanism)

4. **No discs detected**

   - Make sure discs are inserted and readable
   - Try running MakeMKV GUI to test disc compatibility

5. **Drive loading issues**

   - Some USB and laptop drives may not support automatic loading
   - Manually close drives that don't auto-close within the 5-second waiting period

6. **Ripping failures**

   - Check disc condition (scratches, damage)
   - Try ripping manually with MakeMKV GUI
   - Increase retry count in MakeMKV settings

7. **Web UI connection issues**

   - Ensure port 3000 is not blocked by firewall
   - Try accessing `http://localhost:3000` in your browser
   - Check browser console for WebSocket connection errors
   - Restart web server: `npm run web`

8. **Web UI operations not responding**

   - Check that the web server is running: `npm run web`
   - Verify MakeMKV is properly installed and configured
   - Try using the CLI interface as a fallback: `npm start`

## ⚠️ Disclaimer

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. Please read the [LICENSE.md](LICENSE.md) file for more info.

**MakeMKV Auto Rip is not linked in any way to MakeMKV**. As such, it isn't "official" and the two are not developed by the same people.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## 📄 License

GPL-3.0-or-later - See [LICENSE.md](LICENSE.md) for details.

## 📚 Additional Documentation

- [Project Information](PROJECT-INFO.md) - Architecture and technical details
- [Changelog](CHANGELOG.md) - Complete version history
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Docker Setup Guide](README-DOCKER.md) - Run via Docker & the Web UI
