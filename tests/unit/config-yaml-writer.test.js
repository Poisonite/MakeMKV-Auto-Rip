import { describe, expect, it, vi } from "vitest";
import { parse as yamlParse } from "yaml";

vi.mock("../../src/config/index.js", () => ({
  AppConfig: { mountPollInterval: 1, validate: vi.fn().mockResolvedValue() },
}));

vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    addSink: vi.fn(() => () => {}),
  },
}));

const { applyConfigToYaml } = await import(
  "../../src/web/routes/api.routes.js"
);

const SAMPLE = `# App config
paths:
  # Where media is written
  movie_rips_dir: "./media"
  logging:
    # Whether to save logs to files
    enabled: true
    dir: "./logs"

# Drive operation settings
drives:
  auto_load: true

handbrake:
  # Enable HandBrake post-processing
  enabled: true
  cpu_percent: 75
  subtitles:
    enabled: true
    default: "1"
`;

describe("applyConfigToYaml", () => {
  it("writes nested values to the right section", () => {
    const result = applyConfigToYaml(SAMPLE, {
      handbrake: { enabled: false, subtitles: { enabled: false } },
    });
    const parsed = yamlParse(result);

    expect(parsed.handbrake.enabled).toBe(false);
    expect(parsed.handbrake.subtitles.enabled).toBe(false);
    // The regex-based writer used to land all three "enabled" keys here.
    expect(parsed.paths.logging.enabled).toBe(true);
  });

  it("preserves comments, ordering and untouched values", () => {
    const result = applyConfigToYaml(SAMPLE, {
      handbrake: { cpu_percent: 50 },
    });

    expect(result).toContain("# App config");
    expect(result).toContain("# Whether to save logs to files");
    expect(result).toContain("# Enable HandBrake post-processing");
    expect(result).toContain("cpu_percent: 50");
    // Quoted values keep their style so saving does not churn the file.
    expect(result).toContain('movie_rips_dir: "./media"');
    expect(result.indexOf("drives:")).toBeLessThan(result.indexOf("handbrake:"));
  });

  it("adds a key that is not in the file yet", () => {
    const result = applyConfigToYaml(SAMPLE, {
      handbrake: { cli_path: "C:/HandBrakeCLI/HandBrakeCLI.exe" },
    });

    expect(yamlParse(result).handbrake.cli_path).toBe(
      "C:/HandBrakeCLI/HandBrakeCLI.exe"
    );
    expect(yamlParse(result).handbrake.enabled).toBe(true);
  });

  it("keeps makemkv_dir when provided and drops it when omitted", () => {
    const withDir = applyConfigToYaml(SAMPLE, {
      paths: { movie_rips_dir: "./media", makemkv_dir: "C:/MakeMKV" },
    });
    expect(yamlParse(withDir).paths.makemkv_dir).toBe("C:/MakeMKV");

    const withoutDir = applyConfigToYaml(withDir, {
      paths: { movie_rips_dir: "./media" },
    });
    expect(yamlParse(withoutDir).paths.makemkv_dir).toBeUndefined();
    expect(yamlParse(withoutDir).paths.movie_rips_dir).toBe("./media");
  });

  it("writes a value whose type changed", () => {
    const result = applyConfigToYaml(SAMPLE, {
      handbrake: { subtitles: { default: "none" } },
      drives: { auto_load: false },
    });
    const parsed = yamlParse(result);

    expect(parsed.handbrake.subtitles.default).toBe("none");
    expect(parsed.drives.auto_load).toBe(false);
  });
});
