/**
 * Vitest global setup file
 * This file runs before all tests and sets up the testing environment
 */

import { vi } from "vitest";
import fs from "fs";
import path from "path";

// Mock external dependencies that require system resources
vi.mock("win-eject", () => ({
  default: {
    eject: vi.fn((drive, callback) => {
      // Simulate successful eject
      setTimeout(() => callback(), 100);
    }),
    close: vi.fn((drive, callback) => {
      // Simulate successful close
      setTimeout(() => callback(), 100);
    }),
  },
}));

// Mock child_process exec for MakeMKV commands
vi.mock("child_process", async () => {
  const actual = await vi.importActual("child_process");
  return {
    ...actual,
    exec: vi.fn((command, callback) => {
      // Mock different MakeMKV command responses
      if (command.includes("info disc:index")) {
        // Mock drive info response
        const mockOutput = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,0,999,0,"","",""`;
        callback(null, mockOutput, "");
      } else if (command.includes("info disc:")) {
        // Mock disc info response
        const mockOutput = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;
        callback(null, mockOutput, "");
      } else if (command.includes("mkv disc:")) {
        // Mock ripping response
        const mockOutput = `MSG:5036,0,1,"Copy complete. 1 titles saved."`;
        callback(null, mockOutput, "");
      } else {
        callback(null, "", "");
      }
    }),
  };
});

// Force AppConfig to always read the test fixture config.yaml
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  const fsActual = actual.default || actual;
  const readFileSync = (filePath, encoding = "utf8", ...rest) => {
    try {
      const fileStr = String(filePath);
      if (fileStr.endsWith("config.yaml")) {
        const fixturePath = path.resolve("./tests/fixtures/config.yaml");
        return (actual.readFileSync || fsActual.readFileSync)(
          fixturePath,
          encoding,
          ...rest
        );
      }
      return (actual.readFileSync || fsActual.readFileSync)(
        filePath,
        encoding,
        ...rest
      );
    } catch (e) {
      return (actual.readFileSync || fsActual.readFileSync)(
        filePath,
        encoding,
        ...rest
      );
    }
  };
  return {
    ...actual,
    default: { ...fsActual, readFileSync },
    readFileSync,
  };
});

// Mock fs operations for test isolation
const originalFs = { ...fs };

// Create test directories if they don't exist (not change tracked by git)
const testDirs = [
  "./test-temp",
  "./test-temp/makemkv",
  "./test-logs",
  "./test-media",
];

// Ensure test directories exist
testDirs.forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created test directory: ${dir}`);
    }
  } catch (error) {
    console.warn(`Failed to create test directory ${dir}:`, error.message);
  }
});

// Verify directories were created
testDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    console.error(`Test directory ${dir} was not created!`);
  }
});

// Global test configuration
globalThis.TEST_CONFIG = {
  // Test configuration paths
  testPaths: {
    mkvDir: "./test-temp/makemkv",
    movieRips: "./test-media",
    logs: "./test-logs",
  },

  // Mock MakeMKV responses
  mockResponses: {
    driveInfo: `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"`,
    discInfo: `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`,
    ripComplete: `MSG:5036,0,1,"Copy complete. 1 titles saved."`,
  },
};

// Setup test environment variables
process.env.NODE_ENV = "test";
process.env.NODE_CONFIG_DIR = "./tests/fixtures/config";

// Cleanup function for after tests
globalThis.testCleanup = () => {
  // Clean up test directories
  testDirs.forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
};

// Auto-cleanup on process exit
process.on("exit", globalThis.testCleanup);
process.on("SIGINT", () => {
  globalThis.testCleanup();
  process.exit();
});
