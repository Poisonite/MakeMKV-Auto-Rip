#!/usr/bin/env node

/**
 * MakeMKV Auto Rip
 * CLI entry point for the application
 */

import { main, setupErrorHandlers } from "./src/app.js";

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  noConfirm: args.includes("--no-confirm"),
  quiet: args.includes("--quiet"),
};

// Setup error handlers
setupErrorHandlers();

// Start the application with flags
main(flags);
