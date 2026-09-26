#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HandBrakeService } from '../src/services/handbrake.service.js';
import { Logger } from '../src/utils/logger.js';
import { FileSystemUtils } from '../src/utils/filesystem.js';

const DEFAULT_CPU_PERCENT = 75;
const DEFAULT_FOLDER = 'media/ALADDIN';

const USAGE = `Usage: node scripts/handbrake-convert-folder.js [folder] [options]

  folder           Folder of MKV files to convert, subfolders included. May be on
                   any drive or a UNC share when given as an absolute path
                   (e.g. G:\\movies, \\\\nas\\media); relative paths resolve
                   against the current directory.
                   (default: ${DEFAULT_FOLDER})
  --cpu-percent=N  Percentage of logical cores each encode may use, 1-100
                   (default: ${DEFAULT_CPU_PERCENT}). Overrides handbrake.cpu_percent
                   in config.yaml for this run only.
  --no-recurse     Only convert MKV files sitting directly in the folder
  -h, --help       Show this message`;

/**
 * @param {string[]} argv - Arguments after the script name
 * @returns {{folder: string, cpuPercent: number, recurse: boolean, help: boolean}}
 * @throws {Error} If an argument is unrecognised or out of range
 */
export function parseArgs(argv) {
  let folder = null;
  let cpuPercent = DEFAULT_CPU_PERCENT;
  let recurse = true;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    if (arg === '--cpu-percent' || arg === '-c') {
      cpuPercent = parseCpuPercent(argv[++i]);
      continue;
    }

    if (arg.startsWith('--cpu-percent=')) {
      cpuPercent = parseCpuPercent(arg.slice('--cpu-percent='.length));
      continue;
    }

    if (arg === '--no-recurse') {
      recurse = false;
      continue;
    }

    if (arg === '--recurse' || arg === '-r') {
      recurse = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (folder !== null) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
    folder = arg;
  }

  return { folder: folder || DEFAULT_FOLDER, cpuPercent, recurse, help };
}

function parseCpuPercent(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new Error(`--cpu-percent must be a number between 1 and 100 (got: ${raw})`);
  }
  return value;
}

/**
 * List the MKV files in a folder, walking subfolders unless told not to.
 * @param {string} folder - Absolute path to search
 * @param {boolean} [recurse] - Whether to descend into subfolders
 * @returns {string[]} Absolute paths
 */
export function collectMkvFiles(folder, recurse = true) {
  return FileSystemUtils.collectMkvFiles(folder, recurse);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exit(2);
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  // path.resolve keeps an absolute path as given, so another drive or a UNC
  // share is used verbatim rather than joined onto the current directory.
  const folder = path.resolve(process.cwd(), options.folder);

  let isDirectory = false;
  try {
    isDirectory = fs.statSync(folder).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    console.error(`Folder not found: ${folder}`);
    process.exit(2);
  }

  const totalCores = HandBrakeService.getAvailableCpuCount();
  const threads = HandBrakeService.getConfiguredThreadCount(options.cpuPercent);
  console.log(
    `CPU allocation: ${options.cpuPercent}% of ${totalCores} logical cores -> ${threads} encoder threads`
  );

  const scope = options.recurse ? 'including subfolders' : 'top level only';
  console.log(`Scanning ${folder} (${scope})...`);

  const files = collectMkvFiles(folder, options.recurse);
  if (files.length === 0) {
    console.log(`No MKV files found in ${folder}`);
    return;
  }

  console.log(`${files.length} MKV file(s) to convert.`);

  const failures = [];
  for (let i = 0; i < files.length; i++) {
    const inputPath = files[i];
    const file = path.basename(inputPath);
    console.log(`\n[${i + 1}/${files.length}] Converting: ${inputPath}`);
    try {
      const success = await HandBrakeService.convertFile(inputPath, {
        cpuPercent: options.cpuPercent,
      });
      if (success) {
        console.log(`Success: ${file}`);
      } else {
        console.error(`Failed: ${file}`);
        failures.push(inputPath);
      }
    } catch (err) {
      console.error(`Error converting ${file}: ${err.message || err}`);
      Logger.error(err);
      failures.push(inputPath);
    }
  }

  console.log(`\nDone: ${files.length - failures.length} converted, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error('Failed files:');
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
