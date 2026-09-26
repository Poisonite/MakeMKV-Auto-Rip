import { execFile } from "child_process";
import os, { availableParallelism, cpus } from "os";
import path from "path";
import { promisify } from "util";
import fs from "fs";
import { open, stat } from "fs/promises";
import { AppConfig } from "../config/index.js";
import { Logger } from "../utils/logger.js";
import { FileSystemUtils } from "../utils/filesystem.js";
import { HANDBRAKE_CONSTANTS } from "../constants/index.js";
import { validateHandBrakeConfig } from "../utils/handbrake-config.js";
import { ProgressHeartbeat } from "../utils/heartbeat.js";
import { formatDuration } from "../utils/format.js";

const execFileAsync = promisify(execFile);

/**
 * Error class for HandBrake-specific errors
 * @extends Error
 */
export class HandBrakeError extends Error {
  /**
   * Create a HandBrake error
   * @param {string} message - The error message
   * @param {string|Object|null} details - Additional error details
   */
  constructor(message, details = null) {
    super(message);
    this.name = 'HandBrakeError';
    this.details = details;
  }
}

/**
 * Service for handling HandBrake post-processing operations
 */
export class HandBrakeService {
  static createCancellationError(message = "HandBrake conversion cancelled") {
    const error = new Error(message);
    error.name = "AbortError";
    error.code = "ABORT_ERR";
    return error;
  }

  static isCancellationError(error, signal = null) {
    return Boolean(
      signal?.aborted ||
      error?.isCancelled === true ||
      error?.name === "AbortError" ||
      error?.code === "ABORT_ERR"
    );
  }

  static parseAdditionalArgs(additionalArgsRaw = "") {
    const raw = String(additionalArgsRaw).trim();
    if (!raw) {
      return [];
    }

    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(raw)) {
      throw new HandBrakeError(
        "Additional arguments contain invalid control characters",
        `Invalid characters detected in: ${raw}`
      );
    }

    const tokens = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const normalizedTokens = tokens.map(token => token.replace(/^"(.*)"$/s, "$1"));
    const hasUnsafeToken = normalizedTokens.some(token =>
      token === '&&' ||
      token === '||' ||
      token === '|' ||
      token === ';' ||
      token === '>' ||
      token === '<' ||
      token.includes('`') ||
      token.includes('$(')
    );

    if (hasUnsafeToken) {
      throw new HandBrakeError(
        'Additional arguments contain unsafe shell operators',
        `Invalid operators detected in: ${raw}`
      );
    }

    return normalizedTokens;
  }

  static hasOption(tokens, optionNames) {
    return tokens.some(token =>
      optionNames.some(optionName => token === optionName || token.startsWith(`${optionName}=`))
    );
  }

  static getAvailableCpuCount() {
    if (typeof availableParallelism === 'function') {
      return availableParallelism();
    }

    const detectedCpus = cpus();
    return Array.isArray(detectedCpus) && detectedCpus.length > 0 ? detectedCpus.length : 1;
  }

  static getConfiguredThreadCount(cpuPercent = AppConfig.handbrake.cpu_percent) {
    const parsedCpuPercent = Number(cpuPercent);
    const safeCpuPercent = Number.isFinite(parsedCpuPercent)
      ? Math.min(Math.max(parsedCpuPercent, 1), 100)
      : 75;

    return Math.max(1, Math.floor(this.getAvailableCpuCount() * (safeCpuPercent / 100)));
  }

  static mergeConfiguredThreadLimit(additionalArgs, cpuPercent = AppConfig.handbrake.cpu_percent) {
    const args = [...additionalArgs];
    const threadCount = this.getConfiguredThreadCount(cpuPercent);
    const encoptsFlags = ['-x', '--encopts'];
    const threadPattern = /(?:^|:)threads=[^:]+(?:$|:)/;
    const appendThreadLimit = (value = '') => {
      if (threadPattern.test(value)) {
        return value;
      }

      return value ? `${value}:threads=${threadCount}` : `threads=${threadCount}`;
    };

    const inlineEncoptsIndex = args.findIndex(token =>
      encoptsFlags.some(flag => token.startsWith(`${flag}=`))
    );
    if (inlineEncoptsIndex !== -1) {
      const token = args[inlineEncoptsIndex];
      const separatorIndex = token.indexOf('=');
      const option = token.slice(0, separatorIndex);
      const value = token.slice(separatorIndex + 1);
      args[inlineEncoptsIndex] = `${option}=${appendThreadLimit(value)}`;
      return args;
    }

    const encoptsIndex = args.findIndex(token => encoptsFlags.includes(token));
    if (encoptsIndex !== -1) {
      const currentValue = args[encoptsIndex + 1];
      if (typeof currentValue === 'string' && !currentValue.startsWith('-')) {
        args[encoptsIndex + 1] = appendThreadLimit(currentValue);
      } else {
        args.splice(encoptsIndex + 1, 0, `threads=${threadCount}`);
      }
      return args;
    }

    args.push('--encopts', `threads=${threadCount}`);
    return args;
  }

  static formatCommand(executable, args) {
    return [
      this.quoteCommandArgument(executable),
      ...args.map(argument => this.quoteCommandArgument(argument))
    ].join(' ');
  }

  static quoteCommandArgument(argument) {
    const value = String(argument);
    if (value === '') {
      return '""';
    }

    if (!/[\s"]/u.test(value)) {
      return value;
    }

    return `"${value.replace(/(["\\])/g, '\\$1')}"`;
  }

  /**
   * Report encode progress once a minute, parsed from HandBrakeCLI's own
   * "Encoding: task 1 of 1, 42.10 %" output. An encode runs for tens of minutes
   * alongside the next rip, so silence for that long is not acceptable.
   * @param {import('child_process').ChildProcess} [child]
   * @param {string} label - File being encoded
   * @returns {() => void} stop function
   */
  static reportProgress(child, label) {
    if (!child) {
      return () => {};
    }

    const startedAtMs = Date.now();
    let percent = null;

    const scan = (chunk) => {
      const matches = [...chunk.toString().matchAll(/([\d.]+)\s*%/g)];
      const latest = matches[matches.length - 1];
      if (latest) {
        percent = Number.parseFloat(latest[1]);
      }
    };
    child.stdout?.on("data", scan);
    child.stderr?.on("data", scan);

    const heartbeat = new ProgressHeartbeat({
      describe: () => {
        const elapsed = formatDuration(
          Math.round((Date.now() - startedAtMs) / 1000)
        );
        return percent === null
          ? `Encoding ${label}: ${elapsed} elapsed`
          : `Encoding ${label}: ${percent.toFixed(1)}% - ${elapsed} elapsed`;
      },
    });

    const stop = heartbeat.start();
    child.once?.("close", stop);
    child.once?.("error", stop);
    return stop;
  }

  /**
   * Drop an encode to below-normal CPU priority. Encoding now overlaps the next
   * disc's rip, and MakeMKV's demux/mux work should never queue behind a job
   * that is happy to take an extra few minutes.
   * @param {import('child_process').ChildProcess} [child]
   */
  static deprioritize(child) {
    if (!child?.pid) {
      return;
    }

    try {
      os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      Logger.debug(`HandBrake running at below-normal priority (pid ${child.pid})`);
    } catch (error) {
      // Not fatal: the encode just runs at normal priority.
      Logger.debug(`Could not lower HandBrake priority: ${error.message}`);
    }
  }

  static calculateTimeoutMs(fileSizeBytes) {
    const { MIN_TIMEOUT_HOURS, MAX_TIMEOUT_HOURS, TIMEOUT } = HANDBRAKE_CONSTANTS;
    const fileSizeGB = fileSizeBytes / (1024 * 1024 * 1024);
    const baseTimeoutMs = MIN_TIMEOUT_HOURS * TIMEOUT.MS_PER_HOUR;
    const maxTimeoutMs = MAX_TIMEOUT_HOURS * TIMEOUT.MS_PER_HOUR;
    const extraTimeoutMs = Math.ceil(fileSizeGB * TIMEOUT.MS_PER_MINUTE);

    return Math.min(baseTimeoutMs + extraTimeoutMs, maxTimeoutMs);
  }

  /**
   * Sleep for the specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fallback presets worth trying, minus the preset that already failed.
   * Retrying the configured preset re-encodes the whole title with the exact
   * same command, which costs a full encode and changes nothing.
   * @param {string} [currentPreset] - Preset the failed attempt used
   * @returns {string[]} Presets to try, in order
   */
  static resolveFallbackPresets(currentPreset = AppConfig.handbrake?.preset) {
    const { FALLBACK_PRESETS } = HANDBRAKE_CONSTANTS.RETRY;
    const normalize = value => String(value ?? '').trim().toLowerCase();
    const failedPreset = normalize(currentPreset);
    const remaining = FALLBACK_PRESETS.filter(preset => normalize(preset) !== failedPreset);

    return remaining.length > 0 ? remaining : [...FALLBACK_PRESETS];
  }

  /**
   * Retry a conversion with fallback preset on failure
   * @param {string} inputPath - Path to input file
   * @param {string} outputPath - Path to output file  
   * @param {string} handBrakePath - Path to HandBrake CLI
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<boolean>} Success status
   * @private
   */
  static async retryConversion(inputPath, outputPath, handBrakePath, retryCount = 0, options = {}) {
    const { MAX_ATTEMPTS } = HANDBRAKE_CONSTANTS.RETRY;
    const signal = options.signal ?? undefined;

    const inputSizeBytes = fs.statSync(inputPath).size;
    const timeoutMs = this.calculateTimeoutMs(inputSizeBytes);
    const fallbackPresets = this.resolveFallbackPresets();
    const maxAttempts = Math.min(MAX_ATTEMPTS, fallbackPresets.length);

    for (let attempt = retryCount; attempt < maxAttempts; attempt++) {
      try {
        if (signal?.aborted) {
          throw this.createCancellationError();
        }

        const fallbackPreset = fallbackPresets[attempt];
        Logger.info(`Retry attempt ${attempt + 1} with preset: ${fallbackPreset}`);

        const { executable, args } = this.buildCommandParts(
          handBrakePath,
          inputPath,
          outputPath,
          fallbackPreset,
          options.cpuPercent ?? null
        );

        const retry = execFileAsync(executable, args, {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024 * 10,
          signal,
        });
        this.deprioritize(retry.child);
        const stopProgress = this.reportProgress(
          retry.child,
          `${path.basename(inputPath)} (retry ${attempt + 1})`
        );

        let stdout;
        let stderr;
        try {
          ({ stdout, stderr } = await retry);
        } finally {
          stopProgress();
        }

        this.parseHandBrakeOutput(stdout, stderr);
        await this.validateOutput(outputPath);

        Logger.info(`Retry successful with preset: ${fallbackPreset}`);
        return true;
      } catch (error) {
        if (this.isCancellationError(error, signal)) {
          throw error;
        }

        Logger.warning(`Retry ${attempt + 1} failed: ${error.message}`);
      }
    }

    Logger.error("Maximum retry attempts reached for HandBrake conversion");
    return false;
  }
  /**
   * Validates HandBrake installation and configuration
   * @param {Object} configOverride - Optional config override for testing
   * @returns {Promise<void>}
   * @throws {HandBrakeError} If HandBrake is not properly configured or installed
   */
  static async validate(configOverride) {
    const config = arguments.length > 0 ? configOverride : AppConfig.handbrake;

    if (!config?.enabled) {
      Logger.info("HandBrake post-processing is disabled");
      return;
    }

    Logger.info("Validating HandBrake setup...");

    // Validate configuration first
    if (arguments.length > 0) {
      this.validateConfig(configOverride);
    } else {
      this.validateConfig();
    }

    // Then validate HandBrake installation
    try {
      await this.getHandBrakePath(configOverride);
      Logger.info("HandBrake validation successful");
    } catch (error) {
      throw new HandBrakeError(
        "HandBrake validation failed - please check your installation",
        error.message
      );
    }
  }

  /**
   * Validates HandBrake configuration
   * @param {Object} configOverride - Optional config override for testing
   * @throws {HandBrakeError} If configuration is invalid
   * @private
   */
  static validateConfig(configOverride) {
    // If called with an explicit argument (even if null/undefined), use it
    // Otherwise use AppConfig.handbrake
    const config = arguments.length > 0 ? configOverride : AppConfig.handbrake;

    // Use utility function for schema validation
    const validation = validateHandBrakeConfig(config);
    if (!validation.isValid) {
      // Include specific errors in the main message for better debugging
      const errorMessage = validation.errors.length === 1 && validation.errors[0] === 'HandBrake configuration is missing or invalid'
        ? validation.errors[0]
        : `HandBrake configuration is invalid: ${validation.errors.join("; ")}`;

      throw new HandBrakeError(
        errorMessage,
        validation.errors.join("; ")
      );
    }

    // Additional validation for conflicting arguments
    if (config.additional_args) {
      const additionalArgs = this.parseAdditionalArgs(config.additional_args);
      const conflictingArgs = ['-i', '--input', '-o', '--output', '--preset'];
      if (this.hasOption(additionalArgs, conflictingArgs)) {
        throw new HandBrakeError(
          `Additional arguments contain conflicting options: ${conflictingArgs.join(', ')}. These are handled automatically.`
        );
      }

      if (this.hasOption(additionalArgs, ['--subtitle-burned'])) {
        throw new HandBrakeError(
          'Additional arguments cannot enable subtitle burn-in. Only soft subtitle tracks are supported.'
        );
      }
    }

    Logger.info("HandBrake configuration validation passed");
  }

  /**
   * Get the HandBrakeCLI path, using either configured path or attempting auto-detection
   * @param {Object} configOverride - Optional config override for testing
   * @returns {Promise<string>} The path to HandBrakeCLI executable
   * @throws {HandBrakeError} If HandBrakeCLI cannot be found
   * @private
   */
  static async getHandBrakePath(configOverride = null) {
    const config = configOverride || AppConfig.handbrake;

    if (config?.cli_path) {
      Logger.debug("Using configured HandBrakeCLI path...");
      if (!fs.existsSync(config.cli_path)) {
        throw new HandBrakeError(
          "Configured HandBrakeCLI path does not exist",
          `Path: ${config.cli_path}`
        );
      }
      Logger.debug(`Found HandBrakeCLI at: ${config.cli_path}`);
      return config.cli_path;
    }

    // Auto-detect based on platform
    Logger.debug("Auto-detecting HandBrakeCLI installation...");
    const isWindows = process.platform === "win32";
    const defaultPaths = isWindows
      ? [
        "C:/Program Files/HandBrake/HandBrakeCLI.exe",
        "C:/Program Files (x86)/HandBrake/HandBrakeCLI.exe"
      ]
      : [
        "/usr/bin/HandBrakeCLI",
        "/usr/local/bin/HandBrakeCLI",
        "/opt/homebrew/bin/HandBrakeCLI" // For macOS Homebrew installations
      ];

    for (const path of defaultPaths) {
      Logger.debug(`Checking path: ${path}`);
      if (fs.existsSync(path)) {
        Logger.debug(`Found HandBrakeCLI at: ${path}`);
        return path;
      }
    }

    throw new HandBrakeError(
      "HandBrakeCLI not found. Please install HandBrake or specify the path in config.yaml",
      `Searched paths: ${defaultPaths.join(", ")}`
    );
  }

  /**
   * Builds the HandBrake command with proper arguments
   * @param {string} handBrakePath - Path to HandBrakeCLI executable
   * @param {string} inputPath - Path to input MKV file
   * @param {string} outputPath - Path to output file
   * @returns {string} Constructed command
   * @private
   */
  /**
   * Sanitize file path to prevent injection attacks
   * @param {string} filePath - The file path to sanitize
   * @returns {string} Sanitized path
   * @throws {HandBrakeError} If path contains dangerous patterns
   * @private
   */
  static sanitizePath(filePath) {
    // Remove null bytes and control characters
    let sanitized = String(filePath).replace(/[\x00-\x1F\x7F]/g, '');

    // Detect path traversal attempts BEFORE normalizing
    if (sanitized.includes('..')) {
      throw new HandBrakeError("Path traversal detected in path", filePath);
    }

    return sanitized;
  }

  static buildCommandParts(handBrakePath, inputPath, outputPath, presetOverride = null, cpuPercentOverride = null) {
    const config = AppConfig.handbrake;
    const preset = String(presetOverride || config.preset || '').trim();

    if (!handBrakePath || !inputPath || !outputPath) {
      throw new HandBrakeError('All paths must be provided for HandBrake command');
    }

    const executable = this.sanitizePath(handBrakePath);
    const sanitizedInputPath = this.sanitizePath(inputPath);
    const sanitizedOutputPath = this.sanitizePath(outputPath);

    const args = [
      '--input', sanitizedInputPath,
      '--output', sanitizedOutputPath,
      '--preset', preset,
      '--verbose=1',
      '--no-dvdnav'
    ];

    if (config.output_format.toLowerCase() === 'mp4') {
      args.push('--optimize');
    }

    const additionalArgs = this.mergeConfiguredThreadLimit(
      this.parseAdditionalArgs(config.additional_args || ''),
      cpuPercentOverride ?? config.cpu_percent
    );
    const hasSubtitleOverrides = this.hasOption(additionalArgs, [
      '--all-subtitles',
      '--first-subtitle',
      '--subtitle',
      '--subtitle-lang-list',
      '--subtitle-default',
      '--subtitle-burned',
      '--subtitle-forced',
      '--native-language'
    ]);
    const subtitlesConfig = config.subtitles || {};
    const subtitlesEnabled = subtitlesConfig.enabled !== false;

    if (subtitlesEnabled && !hasSubtitleOverrides) {
      const langList = typeof subtitlesConfig.lang_list === 'string' && subtitlesConfig.lang_list.trim() !== ''
        ? subtitlesConfig.lang_list.trim()
        : 'eng,any';

      args.push('--subtitle-lang-list', langList);

      if (subtitlesConfig.all !== false) {
        args.push('--all-subtitles');
      } else {
        args.push('--first-subtitle');
      }

      const subtitleDefault = subtitlesConfig.default !== undefined ? String(subtitlesConfig.default).trim() : '1';
      if (subtitleDefault !== '') {
        args.push(`--subtitle-default=${subtitleDefault}`);
      }
    }

    args.push(...additionalArgs);

    return { executable, args };
  }

  /**
   * Builds the HandBrake command with proper arguments
   * @param {string} handBrakePath - Path to HandBrakeCLI executable
   * @param {string} inputPath - Path to input MKV file
   * @param {string} outputPath - Path to output file
   * @param {string|null} presetOverride - Optional preset override (for retries)
   * @returns {string} Constructed command
   * @throws {HandBrakeError} If paths contain invalid characters
   * @private
   */
  static buildCommand(handBrakePath, inputPath, outputPath, presetOverride = null, cpuPercentOverride = null) {
    const { executable, args } = this.buildCommandParts(
      handBrakePath,
      inputPath,
      outputPath,
      presetOverride,
      cpuPercentOverride
    );

    return this.formatCommand(executable, args);
  }

  /**
   * Stat the output file, tolerating a brief window where a finished encode is
   * not yet visible. HandBrakeCLI can exit 0 moments before the file shows up,
   * and treating that as a failed encode throws away a good encode and burns a
   * full retry on the identical command.
   * @param {string} outputPath - Path to the output file
   * @returns {Promise<import('fs').Stats>}
   * @throws {Error} The last stat error if the file never appears
   * @private
   */
  static async statSettledOutput(outputPath) {
    const { OUTPUT_SETTLE_ATTEMPTS, OUTPUT_SETTLE_DELAY_MS } = HANDBRAKE_CONSTANTS.VALIDATION;

    for (let attempt = 1; ; attempt++) {
      try {
        return await stat(outputPath);
      } catch (error) {
        if (error.code !== 'ENOENT' || attempt >= OUTPUT_SETTLE_ATTEMPTS) {
          throw error;
        }

        Logger.debug(
          `Output file not visible yet (attempt ${attempt}/${OUTPUT_SETTLE_ATTEMPTS}), ` +
          `waiting ${OUTPUT_SETTLE_DELAY_MS}ms...`
        );
        await this.sleep(OUTPUT_SETTLE_DELAY_MS);
      }
    }
  }

  /**
   * Validates the output file after conversion
   * @param {string} outputPath - Path to the output file
   * @throws {HandBrakeError} If validation fails
   * @private
   */
  static async validateOutput(outputPath) {
    Logger.debug("Validating HandBrake output...");

    // Check if file exists using async stat
    let stats;
    try {
      stats = await this.statSettledOutput(outputPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new HandBrakeError("HandBrake conversion failed - output file not created");
      }
      throw new HandBrakeError(`Failed to access output file: ${error.message}`);
    }

    const fileSizeMB = (stats.size / 1024 / 1024);

    Logger.debug(`Output file exists, size: ${fileSizeMB.toFixed(2)} MB`);

    // Check if file is empty
    if (!stats || stats.size === 0) {
      throw new HandBrakeError("HandBrake conversion failed - output file is empty");
    }

    // Check if file is suspiciously small (likely corruption)
    if (fileSizeMB < HANDBRAKE_CONSTANTS.MIN_FILE_SIZE_MB) {
      Logger.warning(`Output file is very small (${fileSizeMB.toFixed(2)} MB) - possible conversion issue`);
    }

    // Verify file can be opened (basic corruption check)
    let fileHandle;
    try {
      fileHandle = await open(outputPath, 'r');
      const buffer = Buffer.alloc(1024);
      await fileHandle.read(buffer, 0, 1024, 0);

      // Check for common video file headers
      const header = buffer.toString('hex', 0, 8);
      const expectedHeader = HANDBRAKE_CONSTANTS.FILE_HEADERS[AppConfig.handbrake.output_format.toUpperCase()];
      if (!header.includes(expectedHeader)) {
        Logger.warning('Output file may not be a valid video file - header mismatch');
      }
    } catch (error) {
      throw new HandBrakeError(`Output file appears to be corrupted: ${error.message}`);
    } finally {
      if (fileHandle) {
        await fileHandle.close();
      }
    }

    Logger.debug(`Output file validated successfully (${fileSizeMB.toFixed(2)} MB)`);
  }

  /**
   * Parse HandBrake output for progress information and warnings
   * @param {string} stdout - Standard output from HandBrake
   * @param {string} stderr - Standard error from HandBrake
   * @private
   */
  static parseHandBrakeOutput(stdout, stderr) {
    const allOutput = `${stdout}\n${stderr}`;
    const lines = allOutput.split('\n');

    // Look for encoding progress
    const progressLines = lines.filter(line =>
      line.includes('Encoding:') ||
      line.includes('frame') ||
      line.includes('%')
    );

    if (progressLines.length > 0) {
      const lastProgress = progressLines[progressLines.length - 1];
      Logger.debug(`HandBrake progress: ${lastProgress.trim()}`);
    }

    // Check for warnings (but not errors)
    const warningLines = lines.filter(line =>
      line.toLowerCase().includes('warning') &&
      !line.toLowerCase().includes('error')
    );

    if (warningLines.length > 0) {
      Logger.warning(`HandBrake warnings detected:`);
      warningLines.forEach(warning => Logger.warning(`  ${warning.trim()}`));
    }
  }

  /**
   * Convert an MKV file using HandBrake
   * @param {string} inputPath - Path to input MKV file
   * @param {Object} [options] - Conversion options
   * @param {AbortSignal} [options.signal] - Signal to cancel the encode
   * @param {number|null} [options.cpuPercent] - Percentage of logical cores for this
   *   encode, overriding handbrake.cpu_percent from config.yaml
   * @returns {Promise<boolean>} True if conversion was successful
   */
  static async convertFile(inputPath, options = {}) {
    let outputPath; // Declare here to be accessible in catch block
    let handBrakePath;
    let command; // Declare here to be accessible in catch block
    const signal = options.signal ?? undefined;
    const cpuPercent = options.cpuPercent ?? null;
    try {
      if (!AppConfig.handbrake?.enabled) {
        Logger.info("HandBrake post-processing is disabled, skipping...");
        return true;
      }

      if (signal?.aborted) {
        throw this.createCancellationError();
      }

      Logger.info("Beginning HandBrake post-processing...");
      Logger.debug(`Input file path: ${inputPath}`);

      // Validate input file
      if (!fs.existsSync(inputPath)) {
        throw new HandBrakeError(`Input file does not exist: ${inputPath}`);
      }

      const inputStats = fs.statSync(inputPath);
      const inputSizeMB = (inputStats.size / 1024 / 1024);
      Logger.debug(`Input file size: ${inputSizeMB.toFixed(2)} MB`);

      if (inputStats.size === 0) {
        throw new HandBrakeError(`Input file is empty: ${inputPath}`);
      }

      Logger.debug("Validating HandBrake configuration...");
      this.validateConfig();

      handBrakePath = await this.getHandBrakePath();
      outputPath = path.join(
        path.dirname(inputPath),
        `${path.basename(inputPath, ".mkv")}.${AppConfig.handbrake.output_format.toLowerCase()}`
      );

      Logger.debug(`HandBrake configuration:`);
      Logger.debug(`- CLI Path: ${handBrakePath}`);
      Logger.debug(`- Preset: ${AppConfig.handbrake.preset}`);
      Logger.debug(`- Output Format: ${AppConfig.handbrake.output_format}`);
      Logger.debug(`- Delete Original: ${AppConfig.handbrake.delete_original}`);
      Logger.info(`Starting HandBrake conversion for: ${path.basename(inputPath)}`);
      Logger.debug(`Output format: ${AppConfig.handbrake.output_format}`);
      Logger.debug(`Using preset: ${AppConfig.handbrake.preset}`);
      Logger.debug(`Output will be saved as: ${path.basename(outputPath)}`);
      Logger.debug("This may take a while depending on the file size and preset used.");

      const { executable, args } = this.buildCommandParts(
        handBrakePath,
        inputPath,
        outputPath,
        null,
        cpuPercent
      );
      command = this.formatCommand(executable, args);
      Logger.debug(`Executing command: ${command}`);

      const fileSizeGB = inputStats.size / (1024 * 1024 * 1024);
      const timeoutMs = this.calculateTimeoutMs(inputStats.size);

      Logger.debug(`File size: ${fileSizeGB.toFixed(2)} GB, timeout: ${(timeoutMs / 1000 / 60).toFixed(0)} minutes`);

      // Start timing the conversion
      const conversionStart = Date.now();
      Logger.debug("Starting HandBrake encoding process...");

      const conversion = execFileAsync(executable, args, {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for long outputs
        signal,
      });
      this.deprioritize(conversion.child);
      const stopProgress = this.reportProgress(
        conversion.child,
        path.basename(inputPath)
      );

      let stdout;
      let stderr;
      try {
        ({ stdout, stderr } = await conversion);
      } finally {
        stopProgress();
      }

      // Parse HandBrake output for progress and warnings
      this.parseHandBrakeOutput(stdout, stderr);

      await this.validateOutput(outputPath);

      // Calculate conversion metrics
      const conversionEnd = Date.now();
      const conversionTimeMs = conversionEnd - conversionStart;
      const conversionTimeMin = (conversionTimeMs / 1000 / 60).toFixed(1);

      const outputStats = fs.statSync(outputPath);
      const outputSizeMB = (outputStats.size / 1024 / 1024).toFixed(2);
      const compressionRatio = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);
      const processingSpeed = (fileSizeGB / (conversionTimeMs / 1000 / 60 / 60)).toFixed(2); // GB/hour

      Logger.info(`HandBrake conversion completed successfully: ${path.basename(outputPath)}`);
      Logger.debug(`Conversion metrics:`);
      Logger.debug(`  - Duration: ${conversionTimeMin} minutes`);
      Logger.debug(`  - Original size: ${inputSizeMB.toFixed(2)} MB`);
      Logger.debug(`  - Compressed size: ${outputSizeMB} MB`);
      Logger.debug(`  - Compression: ${compressionRatio}% reduction`);
      Logger.debug(`  - Processing speed: ${processingSpeed} GB/hour`);

      if (AppConfig.handbrake.delete_original) {
        Logger.debug(`Deleting original MKV file: ${path.basename(inputPath)}`);
        await FileSystemUtils.unlink(inputPath);
        Logger.debug("Original MKV file deleted successfully");
      }

      return true;
    } catch (error) {
      if (this.isCancellationError(error, signal)) {
        Logger.warning(`HandBrake conversion cancelled: ${path.basename(inputPath)}`);
        throw error;
      }

      // Attempt retry with fallback presets
      Logger.warning(`Initial conversion failed: ${error.message}`);
      if (handBrakePath && outputPath) {
        Logger.debug("Attempting retry with fallback preset...");

        try {
          const retrySuccess = await this.retryConversion(
            inputPath,
            outputPath,
            handBrakePath,
            0,
            { signal, cpuPercent }
          );

          if (retrySuccess) {
            // Successful retry - check if we should delete original
            if (AppConfig.handbrake.delete_original) {
              Logger.debug(`Deleting original MKV file: ${path.basename(inputPath)}`);
              await FileSystemUtils.unlink(inputPath);
              Logger.debug("Original MKV file deleted successfully");
            }
            return true;
          }
        } catch (retryError) {
          Logger.error(`Retry also failed: ${retryError.message}`);
        }
      } else {
        Logger.debug("Skipping retry because HandBrake command setup did not complete.");
      }

      // Cleanup partial output file on failure
      try {
        if (outputPath && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size === 0 || stats.size < HANDBRAKE_CONSTANTS.VALIDATION.MIN_OUTPUT_SIZE_BYTES) {
            Logger.debug("Removing incomplete output file...");
            fs.unlinkSync(outputPath);
          }
        }
      } catch (cleanupError) {
        Logger.warning(`Failed to cleanup incomplete output file: ${cleanupError.message}`);
      }

      if (error instanceof HandBrakeError) {
        Logger.error(`HandBrake Error: ${error.message}`);
        if (error.details) {
          Logger.error("HandBrake Error Details:", error.details);
        }
      } else if (error.code === 'TIMEOUT') {
        Logger.error("HandBrake conversion timed out - file may be too large or system too slow");
        Logger.error("Consider increasing timeout or using a faster preset");
      } else {
        Logger.error("HandBrake conversion failed with unexpected error:");
        Logger.error(`Error Details: ${error.message || 'Unknown error'}`);
        Logger.error(`Error Name: ${error.name || 'Unknown'}`);
        Logger.error(`Error Code: ${error.code || 'Unknown'}`);
        if (command) {
          Logger.error(`Command: ${command}`);
        }
      }
      return false;
    }
  }
}