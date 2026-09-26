import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const convertFileMock = vi.fn();

vi.mock("../../src/config/index.js", () => ({
  AppConfig: { isHandBrakeEnabled: true },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/services/handbrake.service.js", () => ({
  HandBrakeService: {
    convertFile: (...args) => convertFileMock(...args),
  },
}));

const { EncodeQueue } = await import("../../src/services/encode-queue.js");
const { FileSystemUtils } = await import("../../src/utils/filesystem.js");

describe("EncodeQueue", () => {
  beforeEach(() => {
    convertFileMock.mockReset();
  });

  it("does not queue a file that is already waiting or being encoded", async () => {
    let finishFirst;
    convertFileMock.mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = resolve))
    );
    convertFileMock.mockResolvedValue(true);

    const queue = EncodeQueue.detached();
    queue.add(["a.mkv", "b.mkv"], "/rips/MOVIE");

    await vi.waitFor(() => expect(queue.active?.file).toBe("a.mkv"));

    // The rip finishing the folder offers the same files again.
    queue.add(["a.mkv", "b.mkv", "c.mkv"], "/rips/MOVIE");
    expect(queue.pending.map((job) => job.file)).toEqual(["b.mkv", "c.mkv"]);

    finishFirst(true);
    await queue.wait();

    expect(convertFileMock).toHaveBeenCalledTimes(3);
    expect(queue.succeeded).toEqual(["a.mkv", "b.mkv", "c.mkv"]);
  });

  it("a detached queue runs without a cancellation signal", async () => {
    convertFileMock.mockResolvedValue(true);

    const queue = EncodeQueue.detached();
    queue.add(["a.mkv"], "/rips/MOVIE");
    await queue.wait();

    expect(convertFileMock).toHaveBeenCalledWith(path.join("/rips/MOVIE", "a.mkv"), {
      signal: undefined,
    });
  });
});

describe("FileSystemUtils.findUnconvertedMkvFiles", () => {
  let root;
  const now = Date.now();

  const write = (relative, content, ageMs) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    const time = new Date(now - ageMs);
    fs.utimesSync(full, time, time);
    return full;
  };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "unconverted-"));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds settled MKVs and skips empty, fresh and non-MKV files", () => {
    const settled = write("OLD_DISC/A1_t00.mkv", "video", 60 * 60 * 1000);
    const interrupted = write("OLD_DISC/B1_t01.mkv", "video", 60 * 60 * 1000);
    write("OLD_DISC/B1_t01.mp4", "partial", 60 * 60 * 1000);
    write("DEAD_RIP/A3_t00.mkv", "", 60 * 60 * 1000);
    write("RIPPING_NOW/C1_t02.mkv", "video", 5 * 1000);
    write("OLD_DISC/A1_t00.mp4", "done", 60 * 60 * 1000);

    const found = FileSystemUtils.findUnconvertedMkvFiles(root, { now });

    expect(found).toEqual([settled, interrupted]);
  });

  it("treats an MKV with its output beside it as converted when asked", () => {
    const found = FileSystemUtils.findUnconvertedMkvFiles(root, {
      now,
      skipIfConvertedTo: "mp4",
    });

    expect(found).toEqual([]);
  });

  it("returns nothing when the rips folder does not exist", () => {
    expect(
      FileSystemUtils.findUnconvertedMkvFiles(path.join(root, "missing"))
    ).toEqual([]);
  });
});
