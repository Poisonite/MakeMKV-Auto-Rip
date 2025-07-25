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
   Edit `config/default.json` with your paths

3. **Start ripping:**
   ```bash
   npm start
   ```

## 📋 Requirements

### Essential Software

1. **[MakeMKV](https://www.makemkv.com/)** - Required for all ripping operations
2. **[Node.js](https://nodejs.org/) >= 22.0.0** - Runtime environment
3. **Windows OS** - Currently only tested on Windows 10+

### Optical Drive Management

- **Cross-platform support** - Drive load/eject operations work on Windows, macOS, and Linux
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

## ⚙️ Configuration

### Application Configuration (`config/default.json`)

```json
{
  "Path": {
    "mkvDir": {
      "Dir": "C:\\Program Files (x86)\\MakeMKV"
    },
    "movieRips": {
      "Dir": "C:\\Your\\Movie\\Rips"
    },
    "logging": {
      "toFiles": "true",
      "Dir": "C:\\Your\\Log\\Directory",
      "timeFormat": "12hr"
    },
    "loadDrives": {
      "Enabled": "true"
    },
    "ejectDrives": {
      "Enabled": "true"
    },
    "ripAll": {
      "Enabled": "false"
    },
    "rippingMode": {
      "Mode": "async"
    }
  }
}
```

#### Configuration Options

- **`mkvDir`** - MakeMKV installation directory (usually default location)
- **`movieRips`** - Root directory for ripped movies (create a dedicated folder)
- **`logging.toFiles`** - Enable/disable writing MakeMKV output to log files (`"true"` or `"false"`)
- **`logging.Dir`** - Directory for log files
- **`logging.timeFormat`** - Time format for console/terminal timestamps (`"12hr"` or `"24hr"`)
- **`loadDrives.Enabled`** - Auto-load/close drives before ripping (`"true"` or `"false"`)
- **`ejectDrives.Enabled`** - Auto-eject drives after ripping completion (`"true"` or `"false"`)
- **`ripAll.Enabled`** - Rip all titles that are above MakeMKV min length (`"true"`) or longest title only (`"false"`)
- **`rippingMode.Mode`** - Ripping mode (`"async"` for parallel processing or `"sync"` for sequential processing

**Important Notes:**

- Use double backslashes (`\\`) in Windows paths
- Create directories manually - the application cannot create missing folders
- Recommended: Create dedicated folders for movie rips and logs
- **Performance tip**: Use `"sync"` ripping mode for HDD destinations where concurrent writes impact performance... for SSDs, `"async"` will yield much better overall performance

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
   - Enter a valid key (beta key works) before using Auto Rip

## 🎯 Usage

### Main Application (Ripping)

```bash
npm start          # Interactive ripping interface
# or
npm run rip        # Same as above
# or
node index.js      # Direct execution
```

### Drive Management Only

```bash
npm run load       # Load/close all drives
npm run eject      # Eject all drives
```

## 🔧 Troubleshooting

### Common Issues

1. **"Failed to start application" error**

   - Check that all paths in `config/default.json` exist
   - Ensure MakeMKV is properly installed

2. **"Native optical drive addon failed to load" error**

   - This indicates a corrupted installation or missing native components
   - Try reinstalling the application: `npm install`
   - Ensure you're running on a supported Windows version (Windows 10+)

3. **Drive eject/load operations fail**

   - **Windows: Run as administrator** - Right-click terminal and "Run as administrator"
   - Windows drive operations require elevated privileges for DeviceIoControl API access
   - macOS/Linux: Standard user privileges should work for most drives
   - Manual drive operation may be needed if software control isn't supported by hardware

4. **No discs detected**

   - Make sure discs are inserted and readable
   - Try running MakeMKV GUI first to test disc compatibility

5. **Drive loading issues**

   - Some USB and laptop drives may not support automatic loading
   - Manually close drives that don't auto-close within the 5-second waiting period

6. **Ripping failures**
   - Check disc condition (scratches, damage)
   - Try ripping manually with MakeMKV GUI first
   - Increase retry count in MakeMKV settings

## 📄 License

GPL-3.0-or-later - See [LICENSE.md](LICENSE.md) for details.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## 📚 Additional Documentation

- [Project Information](PROJECT-INFO.md) - Architecture and technical details
- [Changelog](CHANGELOG.md) - Complete version history
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
