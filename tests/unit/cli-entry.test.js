/**
 * Unit tests for CLI entry point (index.js)
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("CLI Entry Point (index.js)", () => {
  describe("File structure", () => {
    it("should have correct shebang for executable", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
    });

    it("should have proper JSDoc comments", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      expect(content).toContain("/**");
      expect(content).toContain("MakeMKV Auto Rip");
      expect(content).toContain("CLI entry point");
    });

    it("should import from src/app.js", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      expect(content).toContain(
        'import { main, setupErrorHandlers } from "./src/app.js"'
      );
    });

    it("should call setupErrorHandlers in the code", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      expect(content).toContain("setupErrorHandlers()");
    });

    it("should call main function in the code", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      expect(content).toContain("main()");
    });
  });

  describe("Module type compatibility", () => {
    it("should be compatible with ES modules", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      // Should use import syntax, not require
      expect(content).toContain("import");
      expect(content).not.toContain("require(");
    });

    it("should not have any module.exports", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      expect(content).not.toContain("module.exports");
      expect(content).not.toContain("exports.");
    });

    it("should be a minimal wrapper around src/app.js", () => {
      const indexPath = path.resolve("./index.js");
      const content = fs.readFileSync(indexPath, "utf8");

      // Enforce this being a short file that just imports and calls app functions, to mandate separation of concerns
      const lines = content.split("\n").filter((line) => line.trim() !== "");
      expect(lines.length).toBeLessThan(15); // Should be a minimal wrapper
    });
  });
});
