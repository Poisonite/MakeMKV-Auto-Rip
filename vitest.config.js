import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Global test settings
    globals: true,
    environment: "node",

    // Test file patterns
    include: [
      "tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
    ],

    // Coverage settings
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "coverage/**",
        "dist/**",
        "packages/*/test{,s}/**",
        "**/*.d.ts",
        "cypress/**",
        "test{,s}/**",
        "test{,-*}.{js,cjs,mjs,ts,tsx,jsx}",
        "**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}",
        "**/*{.,-}spec.{js,cjs,mjs,ts,tsx,jsx}",
        "**/__tests__/**",
        "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
        "**/.{eslint,mocha,prettier}rc.{js,cjs,yml}",
        "**/node_modules/**",
        "vitest.config.js",
      ],
      include: ["src/**/*.{js,jsx,ts,tsx}", "index.js"],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },

    // Test timeout settings
    testTimeout: 20000, // Increased for integration tests
    hookTimeout: 15000,

    // Reporting
    reporter: ["verbose", "json", "html"],
    outputFile: {
      json: "./test-results/results.json",
      html: "./test-results/results.html",
    },

    // Watch mode settings
    watch: false,

    // Parallel execution settings
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // Setup files
    setupFiles: ["./tests/setup.js"],

    // Environment variables for testing
    env: {
      NODE_ENV: "test",
    },

    // Mock settings
    clearMocks: true,
    restoreMocks: true,

    // Retry settings for flaky tests
    retry: 2,
  },

  // Esbuild settings for fast transpilation
  esbuild: {
    target: "node22",
  },
});
