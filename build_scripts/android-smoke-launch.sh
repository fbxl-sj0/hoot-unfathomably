#!/usr/bin/env bash

# Project: Hoot Unfathomably
# --------------------------
#
# File: android-smoke-launch.sh
#
# Purpose:
#
#     Install and launch a Hoot Unfathomably Android APK on the currently
#     connected Android device or emulator, then fail if the app does not
#     reach a running foreground state or if fresh crash output appears.
#
# Responsibilities:
#
#     - Resolve adb from the Android SDK or PATH
#     - Install the selected APK unless the caller requests launch-only mode
#     - Validate the installed notification permission declaration
#     - Clear logcat before launch so crash checks inspect only fresh output
#     - Launch org.brokenlamp.hootunfathomably through the normal launcher intent
#     - Check the app process, foreground state, and recent crash logs
#
# This file intentionally does NOT contain:
#
#     - APK build logic
#     - Emulator creation logic
#     - UI interaction or network login tests

set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

PACKAGE_NAME="${HOOT_UNFATHOMABLY_ANDROID_PACKAGE:-${HOOT_MOBILE_ANDROID_PACKAGE:-org.brokenlamp.hootunfathomably}}"
WAIT_SECONDS="${HOOT_UNFATHOMABLY_SMOKE_WAIT_SECONDS:-${HOOT_MOBILE_SMOKE_WAIT_SECONDS:-20}}"
LOG_LINES="${HOOT_UNFATHOMABLY_SMOKE_LOG_LINES:-${HOOT_MOBILE_SMOKE_LOG_LINES:-180}}"
SKIP_INSTALL="${HOOT_UNFATHOMABLY_SKIP_INSTALL:-${HOOT_MOBILE_SKIP_INSTALL:-0}}"
GRANT_NOTIFICATIONS="${HOOT_UNFATHOMABLY_GRANT_NOTIFICATIONS:-${HOOT_MOBILE_GRANT_NOTIFICATIONS:-0}}"
NOTIFICATION_PERMISSION="android.permission.POST_NOTIFICATIONS"

DEFAULT_APK_PATHS=(
  "android/app/build/outputs/apk/release/app-release.apk"
  "android/app/build/outputs/apk/release/app-release-unsigned.apk"
  "android/app/build/outputs/apk/debug/app-debug.apk"
)

ADB=""
ADB_ARGS=()
LOG_FILE=""

log() {
  printf "[hoot-unfathomably] %s\n" "$*"
}

die() {
  log "Error: $*"
  exit 1
}

command_exists() {
  command -v "$1" &>/dev/null
}

usage() {
  cat <<EOF
Usage: $0 [apk-path]

Environment:
  ANDROID_SERIAL                  adb serial to use when multiple devices exist
  HOOT_UNFATHOMABLY_SKIP_INSTALL=1      launch the already installed package
  HOOT_UNFATHOMABLY_ANDROID_PACKAGE     package name, default org.brokenlamp.hootunfathomably
  HOOT_UNFATHOMABLY_SMOKE_WAIT_SECONDS  wait for app start, default 20
  HOOT_UNFATHOMABLY_SMOKE_LOG_LINES     log lines to print on failure, default 180
  HOOT_UNFATHOMABLY_GRANT_NOTIFICATIONS=1
                                  grant Android 13+ notification permission
                                  before launch for notification testing
EOF
}

cleanup() {
  if [ -n "$LOG_FILE" ]; then
    rm -f "$LOG_FILE"
  fi
}

trap cleanup EXIT

resolve_adb() {
  local candidate=""

  for candidate in \
    "${ANDROID_HOME:-}/platform-tools/adb" \
    "${ANDROID_SDK_ROOT:-}/platform-tools/adb"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      ADB="$candidate"
      return
    fi
  done

  if command_exists adb; then
    ADB=$(command -v adb)
    return
  fi

  die "adb not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or add adb to PATH."
}

configure_adb_target() {
  local devices=""
  local device_count=""

  if [ -n "${ANDROID_SERIAL:-}" ]; then
    ADB_ARGS=(-s "$ANDROID_SERIAL")
    if ! adb_run get-state >/dev/null 2>&1; then
      die "adb device $ANDROID_SERIAL is not available."
    fi
    return
  fi

  devices=$(
    "$ADB" devices |
      awk 'NR > 1 && $2 == "device" { print $1 }'
  )
  device_count=$(printf "%s\n" "$devices" | sed '/^$/d' | wc -l | tr -d ' ')

  if [ "$device_count" = "0" ]; then
    die "no connected Android device or running emulator found."
  fi

  if [ "$device_count" != "1" ]; then
    "$ADB" devices -l
    die "multiple devices found. Set ANDROID_SERIAL before running the smoke test."
  fi
}

adb_run() {
  "$ADB" "${ADB_ARGS[@]}" "$@"
}

android_sdk_version() {
  adb_run shell getprop ro.build.version.sdk 2>/dev/null |
    tr -d '\r' |
    awk 'NF { print $1; exit }'
}

resolve_apk_path() {
  local requested="${1:-}"
  local candidate=""
  local found=""

  if [ "$SKIP_INSTALL" = "1" ]; then
    return
  fi

  if [ -n "$requested" ]; then
    if [ -f "$requested" ]; then
      printf "%s\n" "$requested"
      return
    fi

    if [ -f "$PROJECT_ROOT/$requested" ]; then
      printf "%s\n" "$PROJECT_ROOT/$requested"
      return
    fi

    die "APK not found: $requested"
  fi

  for candidate in "${DEFAULT_APK_PATHS[@]}"; do
    if [ -f "$PROJECT_ROOT/$candidate" ]; then
      printf "%s\n" "$PROJECT_ROOT/$candidate"
      return
    fi
  done

  found=$(
    find "$PROJECT_ROOT/android/app/build/outputs/apk" -type f -name '*.apk' 2>/dev/null |
      sort |
      tail -n 1 || true
  )

  if [ -n "$found" ] && [ -f "$found" ]; then
    printf "%s\n" "$found"
    return
  fi

  die "APK not found. Build the app or pass an APK path."
}

show_recent_logcat() {
  log "Recent logcat output:"
  adb_run logcat -d -v time 2>/dev/null | tail -n "$LOG_LINES" || true
}

clear_logcat() {
  adb_run logcat -c >/dev/null 2>&1 || true
}

app_pid() {
  adb_run shell pidof "$PACKAGE_NAME" 2>/dev/null | tr -d '\r' || true
}

foreground_mentions_package() {
  local activity_output=""
  local window_output=""

  activity_output=$(
    adb_run shell dumpsys activity activities 2>/dev/null |
      tr -d '\r' |
      grep -E "ResumedActivity|topResumedActivity|mFocusedApp" || true
  )
  if printf "%s\n" "$activity_output" | grep -F -q "$PACKAGE_NAME"; then
    return 0
  fi

  window_output=$(
    adb_run shell dumpsys window windows 2>/dev/null |
      tr -d '\r' |
      grep -E "mCurrentFocus|mFocusedApp" || true
  )
  printf "%s\n" "$window_output" | grep -F -q "$PACKAGE_NAME"
}

wait_for_launch() {
  local pid=""
  local saw_pid=0

  for _ in $(seq 1 "$WAIT_SECONDS"); do
    pid=$(app_pid)
    if [ -n "$pid" ]; then
      saw_pid=1
      if foreground_mentions_package; then
        printf "%s\n" "$pid"
        return 0
      fi
    fi

    sleep 1
  done

  if [ "$saw_pid" = "1" ]; then
    log "The app process started but did not become the focused activity."
  else
    log "The app process did not start."
  fi

  return 1
}

check_fresh_crash_logs() {
  local crash_pattern=""
  local package_pattern=""

  LOG_FILE=$(mktemp)
  adb_run logcat -d -v time > "$LOG_FILE" 2>/dev/null || return 0
  package_pattern=$(printf "%s\n" "$PACKAGE_NAME" | sed 's/[][\\.^$*+?{}()|]/\\&/g')

  # Android's monkey launcher itself logs through the AndroidRuntime tag.
  # A bare AndroidRuntime match therefore reports false failures on healthy
  # launches. Android crash reports include a process line naming the package,
  # so the native crash pattern is intentionally scoped to Hoot.
  crash_pattern="E/AndroidRuntime.*Process: $package_pattern|com.facebook.react.common.JavascriptException|ReactNativeJS.*(TypeError|ReferenceError|Error:)|ANR in $package_pattern"

  if grep -E "$crash_pattern" "$LOG_FILE" >/dev/null; then
    log "Fresh Android or React Native crash output was found."
    grep -E -C 6 "$crash_pattern" "$LOG_FILE" || true
    return 1
  fi

  return 0
}

notification_permission_granted() {
  adb_run shell dumpsys package "$PACKAGE_NAME" 2>/dev/null |
    tr -d '\r' |
    grep -F "$NOTIFICATION_PERMISSION: granted=true" >/dev/null
}

grant_notification_permission() {
  adb_run shell pm clear-permission-flags \
    "$PACKAGE_NAME" \
    "$NOTIFICATION_PERMISSION" \
    user-set \
    user-fixed >/dev/null 2>&1 || true
  adb_run shell pm grant "$PACKAGE_NAME" "$NOTIFICATION_PERMISSION" >/dev/null
  adb_run shell appops set "$PACKAGE_NAME" POST_NOTIFICATION allow >/dev/null 2>&1 || true
}

check_notification_permission_surface() {
  local package_dump=""
  local sdk_version=""

  package_dump=$(adb_run shell dumpsys package "$PACKAGE_NAME" 2>/dev/null | tr -d '\r')
  if [ -z "$package_dump" ]; then
    die "could not inspect installed package metadata for $PACKAGE_NAME."
  fi

  if ! printf "%s\n" "$package_dump" | grep -F "$NOTIFICATION_PERMISSION" >/dev/null; then
    die "installed package does not request $NOTIFICATION_PERMISSION."
  fi

  sdk_version=$(android_sdk_version)
  if ! printf "%s\n" "$sdk_version" | grep -E '^[0-9]+$' >/dev/null; then
    log "Could not determine Android SDK version for notification permission check."
    return
  fi

  if [ "$sdk_version" -lt 33 ]; then
    log "Notification permission declaration present; runtime grant is not required on Android $sdk_version."
    return
  fi

  if [ "$GRANT_NOTIFICATIONS" = "1" ]; then
    log "Granting $NOTIFICATION_PERMISSION for Android notification smoke testing."
    grant_notification_permission
  fi

  if notification_permission_granted; then
    log "Android notification permission is granted for $PACKAGE_NAME."
  else
    log "Android notification permission is not granted for $PACKAGE_NAME."
    log "This is expected on a fresh Android 13+ install until the user enables notifications."
    log "Set HOOT_UNFATHOMABLY_GRANT_NOTIFICATIONS=1 when preparing an emulator for local notification testing."
  fi
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

resolve_adb
configure_adb_target

APK_PATH=$(resolve_apk_path "${1:-}")

if [ "$SKIP_INSTALL" != "1" ]; then
  log "Installing APK: $APK_PATH"
  adb_run install -r -d "$APK_PATH"
else
  log "Skipping APK install and launching the installed package."
fi

check_notification_permission_surface

log "Clearing logcat before launch."
clear_logcat

log "Launching $PACKAGE_NAME."
adb_run shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null

PID=$(wait_for_launch) || {
  show_recent_logcat
  exit 1
}

sleep 2

check_fresh_crash_logs || {
  show_recent_logcat
  exit 1
}

log "Smoke launch passed for $PACKAGE_NAME (pid $PID)."

# end of android-smoke-launch.sh
