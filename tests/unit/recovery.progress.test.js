/**
 * ddrescue status parsing, the periodic progress summary, and the "medium
 * absent" guard that keeps a removed disc from being treated as a damaged one.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/config/index.js", () => ({
  AppConfig: { readErrorRecovery: {} },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const { RecoveryService, RecoveryProgressTracker } = await import(
  "../../src/services/recovery.service.js"
);
const { formatBytes, formatDuration } = await import(
  "../../src/utils/format.js"
);

/** A status block exactly as ddrescue 1.28 draws it (with cursor escapes). */
function statusBlock({
  ipos = "2017 MB",
  rescued = "2017 MB",
  badSector = "0 B",
  badAreas = 0,
  readErrors = 0,
  nonTried = "2500 MB",
  pct = "44.65",
  runTime = "5m 12s",
  remaining = "6m 30s",
  rate = "8192 kB/s",
  phase = "Copying non-tried blocks... Pass 1 (forwards)",
} = {}) {
  const up = "[A".repeat(6);
  return (
    `\r${up}     ipos:  ${ipos}, non-trimmed:        0 B,  current rate:   ${rate}\n` +
    `     opos:  ${ipos}, non-scraped:        0 B,  average rate:   6543 kB/s\n` +
    `non-tried:  ${nonTried},  bad-sector:  ${badSector},    error rate:       0 B/s\n` +
    `  rescued:  ${rescued},   bad areas:  ${badAreas},        run time:  ${runTime}\n` +
    `pct rescued:  ${pct}%, read errors:  ${readErrors},  remaining time:  ${remaining}\n` +
    `                              time since last successful read:         0s\n` +
    `\r${phase}`
  );
}

describe("parseDdrescueStatus", () => {
  it("parses a full status block", () => {
    const status = RecoveryService.parseDdrescueStatus(
      statusBlock({ badSector: "1434 kB", badAreas: 12, readErrors: 7 })
    );

    expect(status).toMatchObject({
      rescuedBytes: 2_017_000_000,
      badBytes: 1_434_000,
      badAreas: 12,
      readErrors: 7,
      nonTriedBytes: 2_500_000_000,
      pctRescued: 44.65,
      runTimeSec: 312,
      remainingSec: 390,
      currentRateBps: 8_192_000,
    });
    expect(status.phase).toBe("Copying non-tried blocks");
  });

  it("reads the newest block when several are buffered", () => {
    const tail =
      statusBlock({ pct: "10.00", rescued: "500 MB" }) +
      statusBlock({ pct: "90.00", rescued: "4500 MB" });

    expect(RecoveryService.parseDdrescueStatus(tail)).toMatchObject({
      pctRescued: 90,
      rescuedBytes: 4_500_000_000,
    });
  });

  it("handles 'n/a' times and returns null for unrelated output", () => {
    const status = RecoveryService.parseDdrescueStatus(
      statusBlock({ remaining: "n/a", runTime: "0s" })
    );
    expect(status.remainingSec).toBeNull();
    expect(status.runTimeSec).toBe(0);

    expect(RecoveryService.parseDdrescueStatus("GNU ddrescue 1.28")).toBeNull();
    expect(RecoveryService.parseDdrescueStatus("")).toBeNull();
  });
});

describe("RecoveryProgressTracker", () => {
  function trackerAt(clock, options = {}) {
    return new RecoveryProgressTracker({
      budgetSec: 1200,
      now: () => clock.ms,
      ...options,
    });
  }

  it("describes itself before any status has arrived", () => {
    const clock = { ms: 0 };
    const tracker = trackerAt(clock);

    clock.ms = 30_000;
    expect(tracker.summary()).toBe(
      "Recovering: waiting for the first ddrescue status - 30s elapsed"
    );
  });

  it("flags a stall when the recovered total stops moving", () => {
    const clock = { ms: 0 };
    const tracker = trackerAt(clock);

    tracker.update(RecoveryService.parseDdrescueStatus(statusBlock()));
    expect(tracker.summary()).not.toContain("no new data");

    // Two minutes of identical samples: the drive is stuck on a defect.
    clock.ms = 120_000;
    tracker.update(RecoveryService.parseDdrescueStatus(statusBlock()));

    expect(tracker.summary()).toContain("no new data for 2m 00s");
    expect(tracker.summary()).toContain("working on a damaged area");
  });

  it("clears the stall notice once data flows again", () => {
    const clock = { ms: 0 };
    const tracker = trackerAt(clock);

    tracker.update(RecoveryService.parseDdrescueStatus(statusBlock()));
    clock.ms = 120_000;
    tracker.update(RecoveryService.parseDdrescueStatus(statusBlock()));
    expect(tracker.summary()).toContain("no new data");

    clock.ms = 130_000;
    tracker.update(
      RecoveryService.parseDdrescueStatus(statusBlock({ rescued: "3000 MB" }))
    );

    expect(tracker.summary()).not.toContain("no new data");
  });

  it("counts time between samples that hit new read errors", () => {
    const clock = { ms: 0 };
    const tracker = trackerAt(clock);

    tracker.update(
      RecoveryService.parseDdrescueStatus(statusBlock({ readErrors: 1 }))
    );

    // Ten clean seconds: not attributed to damaged areas.
    clock.ms = 10_000;
    tracker.update(
      RecoveryService.parseDdrescueStatus(statusBlock({ readErrors: 1 }))
    );
    expect(tracker.summary()).toContain("0s of it on damaged areas");

    // The next five seconds turn up two more read errors.
    clock.ms = 15_000;
    tracker.update(
      RecoveryService.parseDdrescueStatus(
        statusBlock({ readErrors: 3, badSector: "4096 B", badAreas: 2 })
      )
    );

    const summary = tracker.summary();
    expect(summary).toContain("5s of it on damaged areas");
    expect(summary).toContain("2 damaged area(s)");
  });

  it("counts scraping and retry phases as damaged-area time", () => {
    const clock = { ms: 0 };
    const tracker = trackerAt(clock);

    tracker.update(RecoveryService.parseDdrescueStatus(statusBlock()));
    clock.ms = 20_000;
    tracker.update(
      RecoveryService.parseDdrescueStatus(
        statusBlock({ phase: "Scraping failed blocks... (forwards)" })
      )
    );

    expect(tracker.summary()).toContain("20s of it on damaged areas");
  });

  it("summarises progress, damage and remaining budget", () => {
    const clock = { ms: 0 };
    const tracker = trackerAt(clock);

    tracker.update(
      RecoveryService.parseDdrescueStatus(
        statusBlock({ badSector: "1434 kB", badAreas: 12, readErrors: 7 })
      )
    );
    const summary = tracker.summary();

    expect(summary).toContain("44.65% of the disc read");
    expect(summary).toContain("12 damaged area(s)");
    expect(summary).toContain("1.4 MB unreadable");
    expect(summary).toContain("5m 12s elapsed");
    expect(summary).toContain("on damaged areas");
    expect(summary).toContain("about 6m 30s left");
    expect(summary).toContain("of recovery budget left");
  });

  it("returns no final summary when nothing was ever sampled", () => {
    expect(new RecoveryProgressTracker().finish()).toBeNull();
  });
});

describe("medium-absent detection", () => {
  const trayOpen =
    `MSG:2003,16777216,3,"Error 'Scsi error - NOT READY:MEDIUM NOT PRESENT - TRAY OPEN' occurred while reading '/VIDEO_TS/VTS_07_1.VOB' at offset '2017198080'"\n` +
    `MSG:5003,0,2,"Failed to save title 1 to file media/C1_t01.mkv"\n`;

  const badSector =
    `MSG:2003,16777216,3,"Error 'Scsi error - MEDIUM ERROR:UNRECOVERED READ ERROR' occurred while reading '/VIDEO_TS/VTS_01_1.VOB' at offset '123'"\n` +
    `MSG:5003,0,2,"Failed to save title 1 to file media/C1_t01.mkv"\n`;

  it("treats a tray-open rip as a removed disc, not a damaged one", () => {
    expect(RecoveryService.isMediumAbsentFailure(trayOpen)).toBe(true);
    expect(RecoveryService.isReadErrorFailure(trayOpen)).toBe(false);
  });

  it("still recovers a genuine read error", () => {
    expect(RecoveryService.isMediumAbsentFailure(badSector)).toBe(false);
    expect(RecoveryService.isReadErrorFailure(badSector)).toBe(true);
  });

  it("recovers when only some errors are medium-absent", () => {
    expect(RecoveryService.isReadErrorFailure(badSector + trayOpen)).toBe(true);
  });
});

describe("formatting helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1_434_000)).toBe("1.4 MB");
    expect(formatBytes(4_700_000_000)).toBe("4.70 GB");
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(312)).toBe("5m 12s");
    expect(formatDuration(3780)).toBe("1h 03m");
  });
});
