/**
 * MakeMKV Auto Rip - Configuration Editor JavaScript
 * Handles the configuration form functionality
 */

class ConfigEditor {
  constructor() {
    this.originalConfig = null;
    this.originalFormData = null;
    this.hasUnsavedChanges = false;
    this.init();
  }

  /**
   * Initialize the configuration editor
   */
  init() {
    this.setupEventListeners();
    this.loadConfiguration();
  }

  /**
   * Setup event listeners for form elements
   */
  setupEventListeners() {
    // Form submission
    document.getElementById("configForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.validateForm()) {
        this.saveConfiguration();
      }
    });

    // Reset form button
    document.getElementById("resetForm").addEventListener("click", () => {
      this.resetForm();
    });

    // Navigation setup
    this.setupNavigation();

    // Conditional field visibility
    this.setupConditionalFields();

    // Change detection
    this.setupChangeDetection();
  }

  /**
   * Setup navigation between configuration sections
   */
  setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-button");
    const sections = document.querySelectorAll(".config-section");

    navButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetSection = button.dataset.section;

        // Update active nav button
        navButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");

        // Update active section
        sections.forEach((section) => {
          section.classList.remove("active");
          if (section.dataset.section === targetSection) {
            section.classList.add("active");
          }
        });
      });
    });
  }

  /**
   * Setup conditional field visibility based on form values
   */
  setupConditionalFields() {
    // Show/hide logging directory based on logging enabled status
    const loggingEnabledRadios = document.querySelectorAll(
      'input[name="paths.logging.enabled"]'
    );
    const loggingDirGroup = document.getElementById("logging_dir_group");

    loggingEnabledRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        const isEnabled =
          document.querySelector('input[name="paths.logging.enabled"]:checked')
            ?.value === "true";
        if (isEnabled) {
          loggingDirGroup.classList.remove("hidden");
          document.getElementById("logging_dir").required = true;
        } else {
          loggingDirGroup.classList.add("hidden");
          document.getElementById("logging_dir").required = false;
        }
      });
    });

    // Handle MakeMKV directory override checkbox
    const overrideMakemkvCheckbox = document.getElementById(
      "override_makemkv_dir"
    );
    const makemkvDirField = document.getElementById("makemkv_dir_field");

    if (overrideMakemkvCheckbox && makemkvDirField) {
      overrideMakemkvCheckbox.addEventListener("change", () => {
        if (overrideMakemkvCheckbox.checked) {
          makemkvDirField.classList.add("enabled");
        } else {
          makemkvDirField.classList.remove("enabled");
          document.getElementById("makemkv_dir").value = "";
        }
      });
    }

    // Handle fake date fields
    const fakeDateDateInput = document.getElementById("fake_date_date");
    const fakeDateTimeInput = document.getElementById("fake_date_time");
    const clearFakeDateButton = document.getElementById("clear_fake_date");

    if (fakeDateDateInput && fakeDateTimeInput) {
      fakeDateDateInput.addEventListener("change", () => {
        this.updateFakeDateValue();
      });

      fakeDateTimeInput.addEventListener("change", () => {
        this.updateFakeDateValue();
      });
    }

    if (clearFakeDateButton) {
      clearFakeDateButton.addEventListener("click", () => {
        if (fakeDateDateInput) fakeDateDateInput.value = "";
        if (fakeDateTimeInput) fakeDateTimeInput.value = "";
        this.updateFakeDateValue();
        this.checkForChanges();
      });
    }
  }

  /**
   * Update the hidden fake_date field based on date and time inputs
   */
  updateFakeDateValue() {
    const fakeDateDateInput = document.getElementById("fake_date_date");
    const fakeDateTimeInput = document.getElementById("fake_date_time");
    const fakeDateHidden = document.getElementById("fake_date");

    if (!fakeDateHidden) return;

    const dateValue = fakeDateDateInput?.value || "";
    const timeValue = fakeDateTimeInput?.value || "";

    if (dateValue && timeValue) {
      fakeDateHidden.value = `${dateValue} ${timeValue}:00`;
    } else if (dateValue) {
      fakeDateHidden.value = dateValue;
    } else {
      fakeDateHidden.value = "";
    }
  }

  /**
   * Setup change detection for form fields
   */
  setupChangeDetection() {
    const form = document.getElementById("configForm");

    // Listen for changes on all form inputs
    form.addEventListener("input", () => {
      this.checkForChanges();
    });

    form.addEventListener("change", () => {
      this.checkForChanges();
    });
  }

  /**
   * Check if form has unsaved changes
   */
  checkForChanges() {
    if (!this.originalFormData) return;

    const currentFormData = this.getFormDataString();
    const hasChanges = currentFormData !== this.originalFormData;

    if (hasChanges !== this.hasUnsavedChanges) {
      this.hasUnsavedChanges = hasChanges;
      this.updateSaveBanner();
    }
  }

  /**
   * Get form data as a string for comparison
   */
  getFormDataString() {
    const form = document.getElementById("configForm");
    const data = {};

    // Get all form elements
    const formElements = form.querySelectorAll("input, select, textarea");

    formElements.forEach((element) => {
      // Skip elements without names
      if (!element.name) return;

      if (element.type === "radio") {
        if (element.checked) {
          data[element.name] = element.value;
        }
      } else if (element.type === "checkbox") {
        data[element.name] = element.checked;
      } else {
        data[element.name] = element.value;
      }
    });

    return JSON.stringify(data, Object.keys(data).sort());
  }

  /**
   * Update save banner visibility
   */
  updateSaveBanner() {
    const saveBanner = document.getElementById("saveBanner");

    if (!saveBanner) {
      console.error("Save banner element not found!");
      return;
    }

    if (this.hasUnsavedChanges) {
      saveBanner.classList.add("show");
    } else {
      saveBanner.classList.remove("show");
    }
  }

  /**
   * Load current configuration from server
   */
  async loadConfiguration() {
    try {
      this.showLoading(true);

      const response = await fetch("/api/config/structured");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.originalConfig = data.config;
      this.populateForm(data.config);

      this.showMessage("Configuration loaded successfully", "success");
    } catch (error) {
      console.error("Failed to load configuration:", error);
      this.showMessage(
        `Failed to load configuration: ${error.message}`,
        "error"
      );
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Populate form fields with configuration data
   */
  populateForm(config) {
    // Paths section
    const makemkvDir = config.paths?.makemkv_dir || "";
    const overrideMakemkvCheckbox = document.getElementById(
      "override_makemkv_dir"
    );
    const makemkvDirField = document.getElementById("makemkv_dir_field");

    if (makemkvDir) {
      overrideMakemkvCheckbox.checked = true;
      makemkvDirField.classList.add("enabled");
      this.setFieldValue("paths.makemkv_dir", makemkvDir);
    } else {
      overrideMakemkvCheckbox.checked = false;
      makemkvDirField.classList.remove("enabled");
      this.setFieldValue("paths.makemkv_dir", "");
    }

    this.setFieldValue(
      "paths.movie_rips_dir",
      config.paths?.movie_rips_dir || ""
    );
    this.setRadioValue(
      "paths.logging.enabled",
      config.paths?.logging?.enabled ?? true
    );
    this.setFieldValue("paths.logging.dir", config.paths?.logging?.dir || "");
    this.setFieldValue(
      "paths.logging.time_format",
      config.paths?.logging?.time_format || "12hr"
    );

    // Drives section
    this.setRadioValue("drives.auto_load", config.drives?.auto_load ?? true);
    this.setRadioValue("drives.auto_eject", config.drives?.auto_eject ?? true);
    this.setFieldValue("drives.load_delay", config.drives?.load_delay ?? 0);

    // Mount detection section
    this.setFieldValue(
      "mount_detection.wait_timeout",
      config.mount_detection?.wait_timeout ?? 10
    );
    this.setFieldValue(
      "mount_detection.poll_interval",
      config.mount_detection?.poll_interval ?? 1
    );

    // Ripping section
    this.setRadioValue(
      "ripping.rip_all_titles",
      config.ripping?.rip_all_titles ?? false
    );
    this.setFieldValue("ripping.mode", config.ripping?.mode || "async");

    // Interface section
    this.setRadioValue(
      "interface.repeat_mode",
      config.interface?.repeat_mode ?? true
    );

    // MakeMKV section
    const fakeDate = config.makemkv?.fake_date || "";
    const fakeDateDateInput = document.getElementById("fake_date_date");
    const fakeDateTimeInput = document.getElementById("fake_date_time");

    this.setFieldValue("makemkv.fake_date", fakeDate);

    if (fakeDate && fakeDateDateInput && fakeDateTimeInput) {
      // Parse the fake date to populate date and time inputs
      const dateTimeMatch = fakeDate.match(
        /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/
      );
      if (dateTimeMatch) {
        fakeDateDateInput.value = dateTimeMatch[1];
        if (dateTimeMatch[2]) {
          fakeDateTimeInput.value = dateTimeMatch[2];
        }
      }
    } else if (fakeDateDateInput && fakeDateTimeInput) {
      fakeDateDateInput.value = "";
      fakeDateTimeInput.value = "";
    }

    // Trigger conditional field visibility
    const loggingEnabledEvent = new Event("change");
    const loggingEnabledRadio = document.querySelector(
      'input[name="paths.logging.enabled"]:checked'
    );
    if (loggingEnabledRadio) {
      loggingEnabledRadio.dispatchEvent(loggingEnabledEvent);
    }

    // Capture original form data for change detection
    setTimeout(() => {
      this.originalFormData = this.getFormDataString();
      this.hasUnsavedChanges = false;
      this.updateSaveBanner();
    }, 100);
  }

  /**
   * Set a field value by name
   */
  setFieldValue(name, value) {
    const field = document.querySelector(`[name="${name}"]`);
    if (field) {
      field.value = value;
    }
  }

  /**
   * Set a radio button value by name
   */
  setRadioValue(name, value) {
    const radio = document.querySelector(
      `input[name="${name}"][value="${value}"]`
    );
    if (radio) {
      radio.checked = true;
    }
  }

  /**
   * Get form data as structured object
   */
  getFormData() {
    const formData = new FormData(document.getElementById("configForm"));
    const config = {};

    // Helper function to set nested property
    const setNestedProperty = (obj, path, value) => {
      const keys = path.split(".");
      const lastKey = keys.pop();
      const target = keys.reduce((o, key) => {
        if (!o[key]) o[key] = {};
        return o[key];
      }, obj);

      // Convert string values to appropriate types
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (!isNaN(value) && value !== "") value = Number(value);
      else if (value === "" && path !== "makemkv.fake_date") value = undefined; // Remove empty strings except for fake_date

      if (value !== undefined) {
        target[lastKey] = value;
      }
    };

    // Process all form fields
    for (const [name, value] of formData.entries()) {
      setNestedProperty(config, name, value);
    }

    // Handle conditional fields
    const overrideMakemkvCheckbox = document.getElementById(
      "override_makemkv_dir"
    );
    if (!overrideMakemkvCheckbox.checked) {
      // Remove makemkv_dir if override is not checked
      if (config.paths?.makemkv_dir !== undefined) {
        delete config.paths.makemkv_dir;
      }
    }

    return config;
  }

  /**
   * Save configuration to server
   */
  async saveConfiguration() {
    try {
      this.showLoading(true);

      const config = this.getFormData();

      const response = await fetch("/api/config/structured", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      // Show appropriate message based on whether a process was killed
      if (data.processKilled) {
        this.showMessage(
          "Configuration saved successfully! Running rip process was stopped to apply changes.",
          "success"
        );
      } else {
        this.showMessage("Configuration saved successfully!", "success");
      }
      this.originalConfig = config;

      // Update original form data and hide save banner
      this.originalFormData = this.getFormDataString();
      this.hasUnsavedChanges = false;
      this.updateSaveBanner();
    } catch (error) {
      console.error("Failed to save configuration:", error);
      this.showMessage(
        `Failed to save configuration: ${error.message}`,
        "error"
      );
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Reset form to original configuration
   */
  resetForm() {
    if (this.originalConfig) {
      this.populateForm(this.originalConfig);
      this.showMessage("Form reset to current configuration", "warning");

      // Reset change tracking
      setTimeout(() => {
        this.originalFormData = this.getFormDataString();
        this.hasUnsavedChanges = false;
        this.updateSaveBanner();
      }, 100);
    }
  }

  /**
   * Show loading overlay
   */
  showLoading(show) {
    const overlay = document.getElementById("loadingOverlay");
    overlay.style.display = show ? "flex" : "none";
  }

  /**
   * Show message to user
   */
  showMessage(message, type = "info") {
    // Remove existing messages
    const existingMessages = document.querySelectorAll(".message");
    existingMessages.forEach((msg) => msg.remove());

    // Create new message
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;

    // Insert at top of form
    const form = document.getElementById("configForm");
    form.insertBefore(messageDiv, form.firstChild);

    // Auto-remove success/warning messages after delay
    if (type === "success" || type === "warning") {
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 5000);
    }

    // Scroll to top to show message
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Validate form before submission
   */
  validateForm() {
    const form = document.getElementById("configForm");
    const isValid = form.checkValidity();

    if (!isValid) {
      form.reportValidity();
      return false;
    }

    // Additional custom validation
    const movieRipsDir = document.getElementById("movie_rips_dir").value.trim();
    if (!movieRipsDir) {
      this.showMessage("Movie rips directory is required", "error");
      return false;
    }

    const loggingEnabled =
      document.querySelector('input[name="paths.logging.enabled"]:checked')
        ?.value === "true";
    const loggingDir = document.getElementById("logging_dir").value.trim();
    if (loggingEnabled && !loggingDir) {
      this.showMessage(
        "Log directory is required when logging is enabled",
        "error"
      );
      return false;
    }

    return true;
  }
}

// Initialize the configuration editor when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new ConfigEditor();
});
