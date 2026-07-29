#!/usr/bin/env bash

# Project: Hoot Mobile
# --------------------
#
# File: android-env.sh
#
# Purpose:
#
#     Runs Android development commands with the same local Java and Android
#     SDK assumptions used by the release build helper.
#
# Responsibilities:
#
#     * Select an installed Java 17 JDK for Gradle and native CMake builds
#     * Locate the Android SDK used by adb, Gradle, and Expo
#     * Set a development NODE_ENV when the caller has not chosen one
#     * Execute the requested command without hiding its exit status
#
# This file intentionally does NOT contain:
#
#     * APK build logic
#     * Emulator creation logic
#     * Lotide server configuration

set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

JAVA_HOME_CANDIDATES=(
  "${JAVA_HOME:-}"
  "/usr/lib/jvm/java-17-openjdk-amd64"
  "/usr/lib/jvm/java-1.17.0-openjdk-amd64"
  "/usr/lib/jvm/java-17-openjdk"
  "/usr/lib/jvm/default-java"
)

ANDROID_HOME_CANDIDATES=(
  "${ANDROID_SDK_ROOT:-}"
  "${ANDROID_HOME:-}"
  "$HOME/Android/Sdk"
  "$HOME/android-sdk"
)

ANDROID_AVD_HOME_CANDIDATES=(
  "${ANDROID_AVD_HOME:-}"
  "${XDG_CONFIG_HOME:-$HOME/.config}/.android/avd"
  "$HOME/.android/avd"
)

log() {
  printf "[hoot-mobile] %s\n" "$*" >&2
}

java_candidate_has_javac17() {
  local candidate="$1"

  if [ -z "$candidate" ]; then
    return 1
  fi

  if [ ! -x "$candidate/bin/javac" ]; then
    return 1
  fi

  "$candidate/bin/javac" -version 2>&1 | grep -q "javac 17\\."
}

pick_java_home() {
  local candidate=""

  for candidate in "${JAVA_HOME_CANDIDATES[@]}"; do
    if java_candidate_has_javac17 "$candidate"; then
      printf "%s\n" "$candidate"
      return 0
    fi
  done

  return 1
}

pick_android_home() {
  local candidate=""

  for candidate in "${ANDROID_HOME_CANDIDATES[@]}"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      printf "%s\n" "$candidate"
      return 0
    fi
  done

  return 1
}

pick_android_avd_home() {
  local candidate=""

  for candidate in "${ANDROID_AVD_HOME_CANDIDATES[@]}"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      printf "%s\n" "$candidate"
      return 0
    fi
  done

  printf "%s\n" "$HOME/.android/avd"
}

if [ "$#" -eq 0 ]; then
  log "Usage: $0 command [arguments...]"
  exit 2
fi

SELECTED_JAVA_HOME="$(pick_java_home || true)"
if [ -z "$SELECTED_JAVA_HOME" ]; then
  log "OpenJDK 17 was not found. Install openjdk-17-jdk or set JAVA_HOME to a Java 17 JDK."
  exit 1
fi

SELECTED_ANDROID_HOME="$(pick_android_home || true)"
if [ -z "$SELECTED_ANDROID_HOME" ]; then
  log "Android SDK was not found. Set ANDROID_HOME or ANDROID_SDK_ROOT."
  exit 1
fi

export JAVA_HOME="$SELECTED_JAVA_HOME"
export ANDROID_HOME="$SELECTED_ANDROID_HOME"
export ANDROID_SDK_ROOT="$SELECTED_ANDROID_HOME"
export ANDROID_AVD_HOME="$(pick_android_avd_home)"
export NODE_ENV="${NODE_ENV:-development}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PROJECT_ROOT/node_modules/.bin:$PATH"

mkdir -p "$ANDROID_AVD_HOME"

exec "$@"

# end of android-env.sh
