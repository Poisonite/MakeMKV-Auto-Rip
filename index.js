#!/usr/bin/env node

/**
 * MakeMKV Auto Rip
 * CLI entry point for the application
 */

import { main, setupErrorHandlers } from "./src/app.js";

// Setup error handlers
setupErrorHandlers();

// Start the application
main();
