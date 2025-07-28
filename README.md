# MakeMKV Auto Rip

Automatically rips DVDs and Blu-ray discs using the MakeMKV console and saves them to unique folders.

## ⚠️ Disclaimer

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. Please read the [LICENSE.md](LICENSE.md) file for more info.

**MakeMKV Auto Rip is not linked in any way to MakeMKV** and as such isn't "official" and the two are not developed by the same people.

## ✨ Features

- **🖥️ Interactive CLI** - Simple menu-driven interface
- **💿 Multi-format support** - DVDs and Blu-ray discs
- **🔍 Smart title detection** - Automatically finds the main movie
- **📁 Unique folders** - No file conflicts with automatic folder naming
- **📊 Flexible processing** - Choose between parallel (async) or sequential (sync) ripping
- **📝 Comprehensive logging** - Optional detailed operation logs with configurable 12hr/24hr console timestamps
- **⚡ Advanced drive management** - Separate control for loading and ejecting drive preferences
- **🎛️ Flexible options** - Rip longest title or all titles (that are above MakeMKV min title length)

## 🚀 Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure the application:**
   Edit `config.yaml` with your paths

3. **Start ripping:**
   ```bash
   npm start
   ```

## 📋 Requirements

### Essential Software

1. **[MakeMKV](https://www.makemkv.com/)** - Required for all ripping operations (Each new version of Auto Rip is only tested with the most recent MakeMKV version)
2. **[Node.js](https://nodejs.org/)** - Runtime environment (only >= v22 officially tested)
3. **Cross-platform OS support** - Works on Windows, macOS, and Linux (only (officially) tested on Windows 10+ & Debian/Ubuntu Linux)

### Cross-Platform Support

- **Automatic MakeMKV Detection** - Finds MakeMKV installation automatically on all platforms:
  - **Windows**: `C:/Program Files/MakeMKV` or `C:/Program Files (x86)/MakeMKV`
  - **Linux**: `/usr/bin`, `/usr/local/bin`, or `/opt/makemkv/bin`
  - **macOS**: `/Applications/MakeMKV.app/Contents/MacOS`, `/opt/homebrew/bin`, or `/usr/local/bin`
- **Manual Override** - Configure custom MakeMKV path in `config.yaml` if needed
- **Optical Drive Management** - Drive load/eject operations work on Windows, macOS, and Linux
- **Windows implementation** - Uses native C++ addon for reliable Windows DeviceIoControl API access
- **Pre-built native components** - No compilation required, native addon included in repository
- **Administrator privileges required on Windows** - Run terminal as administrator for drive operations
- **No Python or build tools required** - Ready to use out of the box

### Recommended Software

- **Java** - Required for certain MakeMKV features
- **VLC Media Player** - For viewing ripped .mkv files

## 🛠️ Installation

1. **Download this repository**
2. **Install Node.js** from [nodejs.org](https://nodejs.org/)
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Configure the application** (see Configuration section below)
5. **Configure MakeMKV GUI** (see MakeMKV Configuration section below)

### Linux Drive Management Setup (Optional)

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

**Important Notes:**

- Recommended: Create dedicated folders for movie rips and logs
- **Performance tip**: Use `"sync"` ripping mode for HDD destinations where concurrent writes impact performance... for SSDs, `"async"` will yield much better overall performance
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

4. **For Blu-ray discs:**
   - Run at least one Blu-ray through the MakeMKV GUI first
   - Enter a valid key (beta key works - but please support the MakeMKV team if you find their software useful or time-saving!) before using Auto Rip

## 🎯 Usage

### Main Application (Ripping)

```bash
npm start          # Interactive ripping interface
```

### Drive Management Only

```bash
npm run load       # Load/close all drives
npm run eject      # Eject all drives
```

## 🔧 Troubleshooting

### Common Issues

1. **"Failed to start application" error**

   - Check that all paths in `config.yaml` exist and use forward slashes (/) for cross-platform compatibility
   - Ensure MakeMKV is properly installed

2. **"(Windows) Native optical drive addon failed to load" error**

   - This indicates a corrupted installation or missing native components
   - Try reinstalling the application: `npm install` - or building native addon from scratch `npm run build`
   - Ensure you're running on a supported Windows version (Windows 10+ officially tested - theoretically compatible back to ~Windows 2000)

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

## 📄 License

GPL-3.0-or-later - See [LICENSE.md](LICENSE.md) for details.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## 📚 Additional Documentation

- [Project Information](PROJECT-INFO.md) - Architecture and technical details
- [Changelog](CHANGELOG.md) - Complete version history
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
