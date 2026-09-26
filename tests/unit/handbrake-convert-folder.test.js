import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  collectMkvFiles,
  parseArgs,
} from "../../scripts/handbrake-convert-folder.js";

let fixtureRoot;
let library;

const touch = (...segments) => {
  const full = path.join(...segments);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "");
  return full;
};

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "convert-folder-"));
  library = path.join(fixtureRoot, "movies");

  touch(library, "top.mkv");
  touch(library, "ignore.mp4");
  touch(library, "WICKED_FOR_GOOD", "A1_t00.mkv");
  touch(library, "WICKED_FOR_GOOD", "A1_t01.MKV");
  touch(library, "Nested", "Deeper", "deep.mkv");
});

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("handbrake-convert-folder parseArgs", () => {
  it("defaults to the media folder, recursing, at 75% CPU", () => {
    expect(parseArgs([])).toEqual({
      folder: "media/ALADDIN",
      cpuPercent: 75,
      recurse: true,
      help: false,
    });
  });

  it("keeps an absolute folder on another drive or share as typed", () => {
    expect(parseArgs(["G:\\movies"]).folder).toBe("G:\\movies");
    expect(parseArgs(["\\\\nas\\media"]).folder).toBe("\\\\nas\\media");
  });

  it("turns recursion off with --no-recurse", () => {
    expect(parseArgs(["--no-recurse", "media"]).recurse).toBe(false);
    expect(parseArgs(["--no-recurse", "--recurse", "media"]).recurse).toBe(true);
  });

  it("still reads the CPU percentage in both spellings", () => {
    expect(parseArgs(["--cpu-percent=40"]).cpuPercent).toBe(40);
    expect(parseArgs(["-c", "40"]).cpuPercent).toBe(40);
    expect(() => parseArgs(["--cpu-percent=0"])).toThrow(/between 1 and 100/);
  });

  it("takes a single folder only", () => {
    expect(() => parseArgs(["one", "two"])).toThrow(/Unexpected extra argument/);
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option: --nope/);
  });
});

describe("handbrake-convert-folder collectMkvFiles", () => {
  it("walks subfolders and ignores non-MKV files", () => {
    expect(collectMkvFiles(library, true)).toEqual([
      path.join(library, "top.mkv"),
      path.join(library, "Nested", "Deeper", "deep.mkv"),
      path.join(library, "WICKED_FOR_GOOD", "A1_t00.mkv"),
      path.join(library, "WICKED_FOR_GOOD", "A1_t01.MKV"),
    ]);
  });

  it("stays at the top level when recursion is off", () => {
    expect(collectMkvFiles(library, false)).toEqual([
      path.join(library, "top.mkv"),
    ]);
  });

  it("returns nothing for an unreadable folder instead of throwing", () => {
    expect(collectMkvFiles(path.join(fixtureRoot, "NotThere"), true)).toEqual(
      []
    );
  });
});
