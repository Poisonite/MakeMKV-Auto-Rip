#!/usr/bin/env bash
set -euo pipefail

SETTINGS_DIR="/home/makemkv/.MakeMKV"
SETTINGS_FILE="${SETTINGS_DIR}/settings.conf"

mkdir -p "${SETTINGS_DIR}"

# Ensure settings file exists
if [[ ! -f "${SETTINGS_FILE}" ]]; then
  printf 'app_Key = ""\n' > "${SETTINGS_FILE}"
fi

# Helper to set or update a quoted key=value line in settings.conf
set_quoted_setting() {
  local key="$1"
  local value="$2"
  if grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "${SETTINGS_FILE}"; then
    sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${key} = \"${value}\"|" "${SETTINGS_FILE}"
  else
    printf '%s = "%s"\n' "${key}" "${value}" >> "${SETTINGS_FILE}"
  fi
}

# Accept key via env var or file (preferred for secrets)
APP_KEY="${MAKEMKV_APP_KEY:-${MAKEMKV_KEY:-}}"
if [[ -n "${MAKEMKV_APP_KEY_FILE:-}" && -f "${MAKEMKV_APP_KEY_FILE}" ]]; then
  APP_KEY="$(tr -d '\r' < "${MAKEMKV_APP_KEY_FILE}" | sed -e 's/^\s\+//' -e 's/\s\+$//')"
fi

if [[ -n "${APP_KEY}" ]]; then
  set_quoted_setting "app_Key" "${APP_KEY}"
fi

# Additional configurable settings with sensible defaults
MIN_TITLE_LENGTH="${MAKEMKV_MIN_TITLE_LENGTH:-1000}"
IO_ERROR_RETRY_COUNT="${MAKEMKV_IO_ERROR_RETRY_COUNT:-10}"

# Basic validation (numeric)
if ! [[ "${MIN_TITLE_LENGTH}" =~ ^[0-9]+$ ]]; then MIN_TITLE_LENGTH=1000; fi
if ! [[ "${IO_ERROR_RETRY_COUNT}" =~ ^[0-9]+$ ]]; then IO_ERROR_RETRY_COUNT=10; fi

set_quoted_setting "dvd_MinimumTitleLength" "${MIN_TITLE_LENGTH}"
set_quoted_setting "io_ErrorRetryCount" "${IO_ERROR_RETRY_COUNT}"

exec "$@"


