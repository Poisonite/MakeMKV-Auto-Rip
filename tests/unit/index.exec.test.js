import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";

async function runIndexWithArgs(args, spies) {
  const filePath = resolve("./index.js");
  let code = readFileSync(filePath, "utf8");
  code = code.replace(/^#!.*\n/, ""); // strip shebang
  // Replace the static import with injected mocks
  code = code.replace(
    /import\s+\{\s*main\s*,\s*setupErrorHandlers\s*\}\s+from\s+"\.\/src\/app\.js";?/,
    "const { main, setupErrorHandlers } = globalThis.__appMocks__;"
  );

  const sandbox = {
    process: { ...process, argv: ["node", "index.js", ...args] },
    console,
    setTimeout,
    clearTimeout,
  };
  // expose mocks via globalThis
  sandbox.__appMocks__ = spies;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const script = new vm.Script(code, { filename: filePath });
  script.runInContext(context);
}

describe("CLI Entry Execution (index.js)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should setup error handlers and call main with parsed flags (noConfirm + quiet)", async () => {
    const setupSpy = vi.fn();
    const mainSpy = vi.fn();
    await runIndexWithArgs(["--no-confirm", "--quiet"], {
      setupErrorHandlers: setupSpy,
      main: mainSpy,
    });
    expect(setupSpy).toHaveBeenCalledOnce();
    expect(mainSpy).toHaveBeenCalledWith({ noConfirm: true, quiet: true });
  });

  it("should default flags to false when not provided", async () => {
    const setupSpy = vi.fn();
    const mainSpy = vi.fn();
    await runIndexWithArgs([], { setupErrorHandlers: setupSpy, main: mainSpy });
    expect(setupSpy).toHaveBeenCalledOnce();
    expect(mainSpy).toHaveBeenCalledWith({ noConfirm: false, quiet: false });
  });
});
