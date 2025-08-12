// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Minimal DOM matching the elements used by ConfigEditor
const mountDOM = () => {
  document.body.innerHTML = `
    <nav class="config-nav">
      <button class="nav-button active" data-section="paths" type="button"></button>
      <button class="nav-button" data-section="drives" type="button"></button>
    </nav>
    <div class="config-content">
      <form id="configForm" class="config-form">
        <section class="config-section active" data-section="paths"></section>
        <section class="config-section" data-section="drives"></section>

        <input type="checkbox" id="override_makemkv_dir" />
        <div id="makemkv_dir_field"></div>
        <input type="text" id="makemkv_dir" name="paths.makemkv_dir" />

        <input type="text" id="movie_rips_dir" name="paths.movie_rips_dir" required />

        <input type="radio" name="paths.logging.enabled" value="true" />
        <input type="radio" name="paths.logging.enabled" value="false" />
        <div id="logging_dir_group" class="hidden"></div>
        <input type="text" id="logging_dir" name="paths.logging.dir" />
        <select id="time_format" name="paths.logging.time_format"></select>

        <input type="radio" name="drives.auto_load" value="true" />
        <input type="radio" name="drives.auto_load" value="false" />
        <input type="radio" name="drives.auto_eject" value="true" />
        <input type="radio" name="drives.auto_eject" value="false" />
        <input type="number" id="load_delay" name="drives.load_delay" />

        <input type="number" id="wait_timeout" name="mount_detection.wait_timeout" />
        <input type="number" id="poll_interval" name="mount_detection.poll_interval" />

        <input type="radio" name="ripping.rip_all_titles" value="true" />
        <input type="radio" name="ripping.rip_all_titles" value="false" />
        <select id="ripping_mode" name="ripping.mode"></select>

        <input type="radio" name="interface.repeat_mode" value="true" />
        <input type="radio" name="interface.repeat_mode" value="false" />

        <input type="date" id="fake_date_date" />
        <input type="time" id="fake_date_time" />
        <button type="button" id="clear_fake_date"></button>
        <input type="hidden" id="fake_date" name="makemkv.fake_date" />
      </form>
    </div>
    <div id="saveBanner" class="save-banner"></div>
    <div id="loadingOverlay" style="display:none"></div>
    <button id="resetForm" type="button"></button>
  `;
};

const mockConfig = {
  paths: {
    makemkv_dir: "C:/Program Files/MakeMKV",
    movie_rips_dir: "./media",
    logging: { enabled: true, dir: "./logs", time_format: "12hr" },
  },
  drives: { auto_load: true, auto_eject: true, load_delay: 0 },
  mount_detection: { wait_timeout: 10, poll_interval: 1 },
  ripping: { rip_all_titles: false, mode: "async" },
  interface: { repeat_mode: true },
  makemkv: { fake_date: "2023-12-25 10:00:00" },
};

describe("ConfigEditor (config.js)", () => {
  let originalAddEventListener;
  beforeEach(() => {
    vi.useFakeTimers();
    mountDOM();
    // jsdom lacks scrollTo
    window.scrollTo = vi.fn();
    // Intercept DOMContentLoaded registration to avoid accumulating listeners
    originalAddEventListener = document.addEventListener.bind(document);
    // @ts-ignore
    document.addEventListener = (type, handler, options) => {
      if (type === "DOMContentLoaded") {
        // store but do not attach
        // @ts-ignore
        globalThis.__domReadyHandler = handler;
        return;
      }
      return originalAddEventListener(type, handler, options);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    // @ts-ignore
    document.addEventListener = originalAddEventListener;
    // @ts-ignore
    globalThis.__domReadyHandler = undefined;
  });

  it("initializes, fetches config and populates form correctly", async () => {
    const fetchMock = vi.fn((url) => {
      if (url === "/api/config/structured") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ config: mockConfig }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    // @ts-ignore
    global.fetch = fetchMock;

    // Import module (registers DOMContentLoaded listener)
    await import("../../src/web/static/js/config.js");

    // Trigger initialization via captured handler
    // @ts-ignore
    globalThis.__domReadyHandler &&
      globalThis.__domReadyHandler(new Event("DOMContentLoaded"));

    // Let async tasks and delayed capture run
    await vi.runAllTimersAsync();

    // Populated fields
    expect(document.getElementById("movie_rips_dir").value).toBe("./media");
    expect(
      document.querySelector(
        'input[name="paths.logging.enabled"][value="true"]'
      ).checked
    ).toBe(true);
    // Conditional visibility applied
    expect(
      document.getElementById("logging_dir_group").classList.contains("hidden")
    ).toBe(false);
    expect(document.getElementById("logging_dir").required).toBe(true);
    // Fake date split
    expect(document.getElementById("fake_date_date").value).toBe("2023-12-25");
    expect(document.getElementById("fake_date_time").value).toBe("10:00");
    // Save banner hidden initially
    expect(
      document.getElementById("saveBanner").classList.contains("show")
    ).toBe(false);
  });

  it("handles conditional fields, change detection, and save flow", async () => {
    const fetchMock = vi.fn((url, opts) => {
      if (url === "/api/config/structured" && !opts) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ config: mockConfig }),
        });
      }
      if (url === "/api/config/structured" && opts && opts.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ processKilled: false }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    // @ts-ignore
    global.fetch = fetchMock;

    await import("../../src/web/static/js/config.js");
    // @ts-ignore
    globalThis.__domReadyHandler &&
      globalThis.__domReadyHandler(new Event("DOMContentLoaded"));
    await vi.runAllTimersAsync();

    // Override MakeMKV checkbox toggles class and clears value when unchecked
    const override = document.getElementById("override_makemkv_dir");
    const field = document.getElementById("makemkv_dir_field");
    const input = document.getElementById("makemkv_dir");
    expect(override.checked).toBe(true);
    expect(field.classList.contains("enabled")).toBe(true);
    // Uncheck -> remove class and clear value
    override.checked = false;
    override.dispatchEvent(new Event("change"));
    expect(field.classList.contains("enabled")).toBe(false);
    expect(input.value).toBe("");

    // Fake date composed from inputs
    const date = document.getElementById("fake_date_date");
    const time = document.getElementById("fake_date_time");
    const hidden = document.getElementById("fake_date");
    // Clear time, then set date -> date-only value
    time.value = "";
    time.dispatchEvent(new Event("change"));
    date.value = "2024-02-29";
    date.dispatchEvent(new Event("change"));
    expect(hidden.value).toBe("2024-02-29");
    time.value = "08:05";
    time.dispatchEvent(new Event("change"));
    expect(hidden.value).toBe("2024-02-29 08:05:00");

    // Logging enabled toggle hides group and removes required
    const enabledFalse = document.querySelector(
      'input[name="paths.logging.enabled"][value="false"]'
    );
    enabledFalse.checked = true;
    enabledFalse.dispatchEvent(new Event("change"));
    expect(
      document.getElementById("logging_dir_group").classList.contains("hidden")
    ).toBe(true);
    expect(document.getElementById("logging_dir").required).toBe(false);

    // Change detection toggles save banner
    const form = document.getElementById("configForm");
    const movieDir = document.getElementById("movie_rips_dir");
    movieDir.value = "./changed";
    form.dispatchEvent(new Event("input"));
    expect(
      document.getElementById("saveBanner").classList.contains("show")
    ).toBe(true);

    // Save submission sends POST with structured body and hides banner
    form.dispatchEvent(new Event("submit"));
    await vi.runAllTimersAsync();
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/config/structured" && c[1]?.method === "POST"
    );
    expect(postCall).toBeTruthy();
    const sent = JSON.parse(postCall[1].body);
    expect(sent).toHaveProperty("config");
    expect(typeof sent.config).toBe("object");
    expect(
      document.getElementById("saveBanner").classList.contains("show")
    ).toBe(false);
  });

  it("validates required fields and shows error messages without posting", async () => {
    const fetchMock = vi.fn((url) => {
      if (url === "/api/config/structured") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ config: mockConfig }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    // @ts-ignore
    global.fetch = fetchMock;

    await import("../../src/web/static/js/config.js");
    // @ts-ignore
    globalThis.__domReadyHandler &&
      globalThis.__domReadyHandler(new Event("DOMContentLoaded"));
    await vi.runAllTimersAsync();

    const form = document.getElementById("configForm");
    // Stub validity to bypass native checks in jsdom
    form.checkValidity = () => true;
    form.reportValidity = vi.fn();

    // 1) Missing movie_rips_dir
    const movieDir = document.getElementById("movie_rips_dir");
    movieDir.value = "";
    form.dispatchEvent(new Event("submit"));
    // Error message inserted
    expect(document.querySelector(".message.error")).toBeTruthy();
    // No POSTs should have occurred
    expect(
      fetchMock.mock.calls.filter((c) => c[1] && c[1].method === "POST").length
    ).toBe(0);

    // 2) Logging enabled but no logging_dir
    // Clear previous message
    document.querySelectorAll(".message").forEach((m) => m.remove());
    // Ensure logging enabled
    const enabledTrue = document.querySelector(
      'input[name="paths.logging.enabled"][value="true"]'
    );
    enabledTrue.checked = true;
    enabledTrue.dispatchEvent(new Event("change"));
    // Clear logging_dir
    const logDir = document.getElementById("logging_dir");
    logDir.value = "";
    // Movie dir set to pass first check
    movieDir.value = "./media";
    form.dispatchEvent(new Event("submit"));
    expect(document.querySelector(".message.error")).toBeTruthy();
    // Still no POST
    expect(
      fetchMock.mock.calls.filter((c) => c[1] && c[1].method === "POST").length
    ).toBe(0);
  });
});
