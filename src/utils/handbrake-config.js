/**
 * Schema validation for HandBrake configuration
 */

/**
 * Validate HandBrake configuration object against schema
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateHandBrakeConfig(config) {
  const errors = [];

  // Check if config exists and is a plain object
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push('HandBrake configuration is missing or invalid');
    return {
      isValid: false,
      errors
    };
  }

  // Check required fields when enabled
  if (config.enabled === true) {
    // Validate preset
    if (!config.preset || typeof config.preset !== 'string' || config.preset.trim() === '') {
      errors.push('preset is required when HandBrake is enabled');
    }

    // Validate output_format
    const validFormats = ['mp4', 'm4v'];
    if (!config.output_format || !validFormats.includes(config.output_format.toLowerCase())) {
      errors.push(`output_format must be one of: ${validFormats.join(', ')}`);
    }

    // Validate cli_path if provided
    if (config.cli_path && typeof config.cli_path !== 'string') {
      errors.push('cli_path must be a string');
    }

    // Validate delete_original
    if (config.delete_original !== undefined && typeof config.delete_original !== 'boolean') {
      errors.push('delete_original must be a boolean');
    }

    // Validate additional_args if provided
    if (config.additional_args && typeof config.additional_args !== 'string') {
      errors.push('additional_args must be a string');
    }

    if (
      config.cpu_percent !== undefined &&
      (typeof config.cpu_percent !== 'number' || !Number.isFinite(config.cpu_percent) || config.cpu_percent < 1 || config.cpu_percent > 100)
    ) {
      errors.push('cpu_percent must be a number between 1 and 100');
    }

    // Validate subtitles config if provided
    if (config.subtitles !== undefined) {
      if (!config.subtitles || typeof config.subtitles !== 'object' || Array.isArray(config.subtitles)) {
        errors.push('subtitles must be an object');
      } else {
        const subtitles = config.subtitles;

        if (subtitles.enabled !== undefined && typeof subtitles.enabled !== 'boolean') {
          errors.push('subtitles.enabled must be a boolean');
        }

        if (subtitles.all !== undefined && typeof subtitles.all !== 'boolean') {
          errors.push('subtitles.all must be a boolean');
        }

        if (subtitles.lang_list !== undefined && typeof subtitles.lang_list !== 'string') {
          errors.push('subtitles.lang_list must be a string');
        }

        if (typeof subtitles.lang_list === 'string' && subtitles.lang_list.trim() !== '') {
          // Basic safety validation: ISO 639-2 codes and/or 'any' separated by commas
          const value = subtitles.lang_list.trim();
          if (!/^[A-Za-z]{3}(?:,(?:[A-Za-z]{3}|any))*$/.test(value)) {
            errors.push('subtitles.lang_list must be a comma separated list of ISO 639-2 codes (e.g. "eng,spa") and/or "any"');
          }
        }

        if (subtitles.default !== undefined) {
          const def = String(subtitles.default).trim();
          if (!(def === '' || def === 'none' || /^[1-9]\d*$/.test(def))) {
            errors.push('subtitles.default must be a positive integer or "none"');
          }
        }

        if (subtitles.burned !== undefined) {
          const burned = String(subtitles.burned).trim();
          if (!(burned === '' || burned === 'none')) {
            errors.push('subtitles.burned must be "none". Subtitle burn-in is not supported.');
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
