# Contributing to MakeMKV Auto Rip

Thank you for your interest in contributing to MakeMKV Auto Rip! This document provides guidelines and information for contributors.

## 🤝 Welcome Contributors

We welcome contributions of all kinds:

- 🐛 Bug reports and fixes
- ✨ New features and enhancements
- 📚 Documentation improvements
- 🧪 Tests and quality improvements
- 🌍 Platform compatibility (Linux, macOS)
- 🎨 User interface improvements

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 22.0.0
- **Git** for version control
- **MakeMKV** installed for testing
- **Windows, Linux, or Docker** - Cross-platform support now available!

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/MakeMKV-Auto-Rip.git
   cd MakeMKV-Auto-Rip
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📋 Development Guidelines

### Code Style

We follow these conventions:

- **ES6+ JavaScript** with modules (`import`/`export`)
- **Async/await** for asynchronous operations
- **PascalCase** for classes (`DiscService`)
- **camelCase** for functions and variables (`getAvailableDiscs`)
- **kebab-case** for file names (`disc.service.js`)
- **UPPER_SNAKE_CASE** for constants (`MEDIA_TYPES`)

### Project Structure

```
src/
├── cli/          # User interface and command handling
├── services/     # Business logic and external integrations
├── utils/        # Reusable utility functions
├── config/       # Configuration management
└── constants/    # Application constants
```

### Adding New Features

1. **Services** - Add business logic to appropriate service modules
2. **Utilities** - Create reusable functions in utils/
3. **CLI** - Update interface for user-facing changes
4. **Config** - Add new configuration options if needed
5. **Documentation** - Update README and relevant docs

## 🐛 Bug Reports

### Before Submitting

- Check existing issues to avoid duplicates
- Test with the latest version
- Verify the issue isn't configuration-related

When you create a bug report, GitHub will guide you through our bug report template to ensure we get all the information needed to help you.
P.S. Thank you so much for helping to improve MakeMKV Auto Rip in any capacity! Your feedback is truly appreciated!

## 💡 Feature Requests

We welcome feature requests! When you create a feature request issue, GitHub will guide you through our template to help us understand your needs and use case.
P.S. Thank you so much for contributing to MakeMKV Auto Rip! Your assistance benefits everyone!

## 🔧 Development Workflow

### Making Changes

1. **Write clean, documented code**
2. **Follow existing patterns** in the codebase
3. **Add JSDoc comments** for public methods
4. **Test your changes** thoroughly
5. **Update documentation** as needed

### Commit Guidelines

Use clear, descriptive commit messages:

```bash
# Good
git commit -m "Add parallel processing for multiple disc ripping"
git commit -m "Fix drive ejection issue on USB drives"
git commit -m "Update README with new configuration options"

# Less good
git commit -m "Fix bug"
git commit -m "Update stuff"
```

### Pull Request Process

1. **Ensure your branch is up to date:**

   ```bash
   git fetch upstream
   git rebase upstream/master
   ```

2. **Test your changes:**

   ```bash
   npm start  # Test main functionality
   npm run load  # Test drive loading (Windows only)
   npm run eject  # Test drive ejection (Windows only)
   npm run docker:build  # Test Docker build
   npm run docker:run  # Test Docker deployment
   ```

3. **Create a pull request** with:
   - Clear title and description
   - Reference to related issues
   - Description of changes made
   - Testing performed

When you create a pull request, GitHub will automatically populate it with our pull request template to ensure all necessary information is included.

## 🧪 Testing

### Manual Testing

- **Test with different disc types (if possible)** (DVD, Blu-ray)
- **Test with multiple drives** when possible
- **Test error scenarios** (missing discs, invalid config)
- **Test all npm commands** (`start`, `load`, `eject`)

### Future: Automated Testing

We're planning to add:

- Unit tests for utility functions
- Integration tests for services
- End-to-end testing workflows

## 🌍 Cross-Platform Support

Cross-platform support now available!

- **Windows** - Full native support with drive loading/ejecting
- **Linux** - Dockerized support with all ripping functionality
- **macOS** - Planned support (contributions welcome!)
- **Docker containers** - Complete containerization with volume management

### Docker Development

Test your changes with Docker:

```bash
npm run docker:build    # Build the Docker image
npm run docker:run      # Start container with docker-compose
npm run docker:logs     # View container logs
npm run docker:stop     # Stop the container
```

### Platform-Specific Features

- **Drive operations** are automatically disabled in Docker/Linux environments
- **MakeMKV paths** adapt automatically to the target platform
- **Dependencies** are conditionally loaded based on the environment

## 📚 Documentation

### Documentation Standards

- **Clear examples** - Include working code examples
- **Up-to-date** - Keep in sync with code changes
- **Accessible** - Use clear language and formatting

### Types of Documentation

- **README.md** - Main user documentation
- **PROJECT-INFO.md** - Technical architecture details
- **CONTRIBUTING.md** - This file
- **CHANGELOG.md** - Version history
- **JSDoc** - Inline code documentation

## 🏷️ Release Process

### Version Numbers

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** - Breaking changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes (backward compatible)

### Release Checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Test thoroughly
4. Create release tag
5. Update documentation

## 📞 Getting Help

### Questions and Support

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and general discussion
- **Email** - For private/security concerns

### Response Times

- We aim to respond to issues within 24-72 hours (this is a side-project and not part of my day-job, but I'll fit in time as much as I'm able to!)
- Pull requests reviewed within one week
- We're a small project, so patience is appreciated!

## 🙏 Recognition

Contributors will be:

- Listed in the project contributors
- Credited in release notes for significant contributions
- Welcomed as maintainers for sustained contributions

## 📄 License

By contributing, you agree that your contributions will be licensed under the same GPL-3.0-or-later license that covers the project.

---

**Thank you for contributing to MakeMKV Auto Rip!** 🎉

Your contributions help make disc ripping easier for everyone. Whether it's fixing a small bug or adding a major feature, every contribution is valuable and appreciated.
