# 🗺️ MakeMKV Auto Rip Roadmap

Welcome to the MakeMKV Auto Rip roadmap! This document outlines upcoming features and improvements we're planning to implement. Whether you're a user curious about new features or a developer looking to contribute, this roadmap will help you understand where the project is heading.

## 🎯 Current Focus Areas

### 🔧 Stability & Error Handling

Improving the robustness and reliability of the ripping process.

### 🎵 User Experience

Making the tool more user-friendly and accessible.

### 🔄 Automation

Enhancing automated workflows for large-scale disc processing.

---

## 📋 Planned Features

### 🚀 High Priority

#### Enhanced Error Handling & Validation

- **Description**: Implement comprehensive exception handling and MakeMKV message code parsing
- **Benefits**: More reliable ripping with better error reporting and automatic recovery
- **Contribution Difficulty**: 🟡 Intermediate
- **Details**:
  - Parse MakeMKV message codes for better error detection:
    - `MSG:5005` - Success: X titles saved
    - `MSG:3042` - IFO file corruption detection
    - `MSG:3035` - Cellwalk algorithm failures (Reverting to Celltrim algorithm)
    - `MSG:3002` - BUP offset mismatches
    - `MSG:5010` - Failed to open disc
    - `MSG:3024` - Complex multiplex encountered (It may take a long time to gather disc info for this disc)
  - Add version validation and compatibility checking
  - Implement automatic retry logic for transient failures

#### MakeMKV Installation & Version Validation

- **Description**: Automatically verify MakeMKV is installed and compatible
- **Benefits**: Prevent runtime errors and guide users through setup
- **Contribution Difficulty**: 🟢 Beginner-Friendly
- **Details**:
  - Check for MakeMKV installation on startup
  - Validate version compatibility using `MSG:1005` and `MSG:5021`
  - Warn users about available updates (`MSG:5075`)
  - Provide helpful installation guidance

#### Docker Support

- **Description**: Provide official Docker images and documentation
- **Benefits**: Simplifies setup and deployment, especially for headless or server environments
- **Contribution Difficulty**: 🟡 Intermediate
- **Details**:
  - Create and maintain a Dockerfile for the project
  - Document environment variables and volume mounts for MakeMKV and output directories
  - Configure a base image which builds MakeMKV for Linux
  - Ensure platform compatibility within containers

### 🎵 Medium Priority

#### Audio Notifications

- **Description**: Add optional sound notifications for completed rips
- **Benefits**: Better user awareness of rip completion, especially for long processes
- **Contribution Difficulty**: 🟡 Intermediate
- **Details**:
  - Configurable sound alerts for successful/failed rips
  - System notification integration
  - Custom sound file support

#### Repeat Mode Configs

- **Description**: Add configurations to the config file for repeat mode and drive loading delay
- **Benefits**: Users can easily enable/disable repeat mode and set their preferred delay
- **Contribution Difficulty**: 🟢 Beginner-Friendly
- **Details**:
  1. Add a configuration option to turn repeat mode on or off
  2. Add a configuration option to adjust the delay time when loading drives (in seconds)

#### NPM Package Distribution

- **Description**: Package and publish MakeMKV Auto Rip as an npm package
- **Benefits**: Easier installation and updates for Node.js users
- **Contribution Difficulty**: 🟡 Intermediate
- **Details**:
  - Prepare the codebase for npm packaging
  - Write documentation for npm installation and usage
  - Publish to the npm registry

### 🔄 Lower Priority

#### Clean Up postinstall Script Output

- **Description**: Refine the `postinstall` script in `package.json` for cleaner console output
- **Benefits**: Improves user experience during installation
- **Contribution Difficulty**: 🟢 Beginner-Friendly
- **Details**:
  - Make the output less verbose and more user-friendly
  - No change to functionality, just improved UX

---

## 🤝 How to Contribute

### For New Contributors

1. **Start with 🟢 Beginner-Friendly** issues - these are great entry points
2. **Check existing issues** in our [GitHub Issues](../../issues) for related discussions
3. **Create an issue** before starting work to discuss your approach
4. **Fork the repository** and create a feature branch
5. **Follow our coding standards** (see [CONTRIBUTING](CONTRIBUTING.md))

### For Experienced Contributors

- **🟡 Intermediate** and **🔴 Advanced** features welcome your expertise
- Consider **breaking down large features** into smaller, manageable PRs
- **Document your changes** thoroughly, especially for complex features

### Development Setup
