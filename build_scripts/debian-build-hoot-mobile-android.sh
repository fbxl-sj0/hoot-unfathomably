#!/usr/bin/env bash

# Project: Hoot Mobile
# -------------------
#
# File: debian-build-hoot-mobile-android.sh
#
# Purpose:
#
#     Automates the local Android SDK setup and build commands needed to
#     produce an Android APK for Hoot Mobile on Debian-based systems.
#
# Responsibilities:
#
#     • Optionally install required system packages when explicitly requested
#     • Configure the Android environment variables
#     • Install project-specific dependencies via npm
#     • Execute Expo prebuild to generate native Android project files
#     • Build the signed/unsigned APK using Gradle
#
# This file intentionally does NOT contain:
#
#     • iOS build logic
#     • Continuous Integration (CI) configuration (see .github/workflows)

# -------------------------------------------------------------------------
# Fail on errors and surface failures in pipelines
# -------------------------------------------------------------------------
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
ANDROID_HOME_DIR="$HOME/android-sdk"
ANDROID_TOOLS_ZIP="commandlinetools-linux-11076708_latest.zip"
NEEDED_PACKAGES="curl git unzip zip openjdk-17-jdk"
EXPO_CLI="$PROJECT_ROOT/node_modules/.bin/expo"
BUILD_NODE_ENV="${HOOT_MOBILE_NODE_ENV:-production}"
INSTALL_SYSTEM_DEPS="${HOOT_MOBILE_INSTALL_SYSTEM_DEPS:-0}"
JAVA_HOME_CANDIDATES=(
  "/usr/lib/jvm/java-17-openjdk-amd64"
  "/usr/lib/jvm/java-1.17.0-openjdk-amd64"
  "/usr/lib/jvm/java-17-openjdk"
  "/usr/lib/jvm/java-21-openjdk-amd64"
  "/usr/lib/jvm/default-java"
)

log() {
  printf "[hoot-mobile] %s\n" "$*"
}

command_exists() {
  command -v "$1" &>/dev/null
}

can_run_root_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi

  command_exists sudo && sudo -n true &>/dev/null
}

run_root_cmd() {
  if command_exists sudo; then
    if sudo -n true &>/dev/null; then
      sudo "$@"
      return
    fi
  fi

  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  log "Skipping root command: $*"
  log "If you're running without sudo access, install these packages manually first: $NEEDED_PACKAGES"
}

maybe_install_system_packages() {
  if ! command_exists apt-get; then
    return 0
  fi

  if [ "$INSTALL_SYSTEM_DEPS" != "1" ]; then
    log "Skipping system package installation."
    log "Set HOOT_MOBILE_INSTALL_SYSTEM_DEPS=1 to run apt-get for: $NEEDED_PACKAGES"
    return 0
  fi

  log "Updating system and installing baseline dependencies..."
  run_root_cmd apt-get update
  run_root_cmd apt-get install -y $NEEDED_PACKAGES
}

warn_if_node_modules_is_not_writable() {
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    return 0
  fi

  if [ ! -w "$PROJECT_ROOT/node_modules" ]; then
    log "Warning: node_modules is not currently writable by this user."
    log "Attempting to repair permissions so npm install can proceed."
    if command_exists sudo && sudo -n true &>/dev/null; then
      run_root_cmd chown -R "$(id -u):$(id -g)" "$PROJECT_ROOT/node_modules"
    else
      log "Could not repair node_modules permissions automatically."
      log "If npm install fails, run: sudo chown -R \"$(id -u):$(id -g)\" \"$PROJECT_ROOT/node_modules\""
    fi
  fi
}

run_npm_install() {
  if [ "${HOOT_MOBILE_BUILD_NO_DEV_DEPS:-0}" = "1" ]; then
    log "Installing production dependencies only to reduce legacy test-package warnings."
    if npm ci --legacy-peer-deps --omit=dev --ignore-scripts --no-audit --no-fund; then
      return 0
    fi
  else
    if NODE_ENV=development npm ci --legacy-peer-deps --no-audit --no-fund; then
      return 0
    fi
  fi

  if [ "${HOOT_MOBILE_NPM_FALLBACK_INSTALL:-0}" != "1" ]; then
    log "npm ci failed and fallback is disabled. Set HOOT_MOBILE_NPM_FALLBACK_INSTALL=1 to retry with npm install."
    return 1
  fi

  log "npm ci failed. Falling back to npm install (this may be slower)."
  if [ "${HOOT_MOBILE_BUILD_NO_DEV_DEPS:-0}" = "1" ]; then
    npm install --legacy-peer-deps --omit=dev --ignore-scripts --no-audit --no-fund
  else
    NODE_ENV=development npm install --legacy-peer-deps --no-audit --no-fund
  fi
}

clear_react_bundle_cache() {
  local bundle_dir="$PROJECT_ROOT/android/app/build/generated/assets/react/release"
  local sourcemap_dir="$PROJECT_ROOT/android/app/build/intermediates/sourcemaps/react/release"
  local legacy_bundle="$PROJECT_ROOT/android/app/src/main/assets/index.android.bundle"

  if [ -d "$bundle_dir" ] || [ -d "$sourcemap_dir" ] || [ -f "$legacy_bundle" ]; then
    log "Clearing stale generated React Native bundles before release build."
  fi

  rm -rf \
    "$bundle_dir" \
    "$sourcemap_dir" \
    "$legacy_bundle"
}

normalize_generated_android_xml() {
  local file=""

  if [ ! -d "$PROJECT_ROOT/android/app/src/main" ]; then
    return
  fi

  while IFS= read -r -d '' file; do
    if [ -s "$file" ] && [ -n "$(tail -c 1 "$file")" ]; then
      printf "\n" >> "$file"
    fi
  done < <(find "$PROJECT_ROOT/android/app/src/main" -type f -name '*.xml' -print0)
}

normalize_generated_android_gradle() {
  local app_gradle="$PROJECT_ROOT/android/app/build.gradle"
  local root_gradle="$PROJECT_ROOT/android/build.gradle"

  if [ -f "$root_gradle" ]; then
    perl -0pi -e "s/maven \\{ url '([^']+)' \\}/maven { url = uri('\\1') }/g" "$root_gradle"
  fi

  if [ ! -f "$app_gradle" ]; then
    return
  fi

  # Expo prebuild still emits Groovy property shorthand that Gradle 9
  # deprecates and Gradle 10 will reject. Keep the generated project buildable
  # on newer Gradle without forking Expo's native project templates.
  perl -0pi -e '
    s/^(\s*)ndkVersion\s+(?!=)(.+)$/${1}ndkVersion = $2/mg;
    s/^(\s*)buildToolsVersion\s+(?!=)(.+)$/${1}buildToolsVersion = $2/mg;
    s/^(\s*)compileSdk\s+(?!=)(.+)$/${1}compileSdk = $2/mg;
    s/^(\s*)namespace\s+(?!=)(.+)$/${1}namespace = $2/mg;
    s/^(\s*)applicationId\s+(?!=)(.+)$/${1}applicationId = $2/mg;
    s/^(\s*)minSdkVersion\s+(?!=)(.+)$/${1}minSdkVersion = $2/mg;
    s/^(\s*)targetSdkVersion\s+(?!=)(.+)$/${1}targetSdkVersion = $2/mg;
    s/^(\s*)versionCode\s+(?!=)(.+)$/${1}versionCode = $2/mg;
    s/^(\s*)versionName\s+(?!=)(.+)$/${1}versionName = $2/mg;
    s/^(\s*)storeFile\s+(?!=)(.+)$/${1}storeFile = $2/mg;
    s/^(\s*)storePassword\s+(?!=)(.+)$/${1}storePassword = $2/mg;
    s/^(\s*)keyAlias\s+(?!=)(.+)$/${1}keyAlias = $2/mg;
    s/^(\s*)keyPassword\s+(?!=)(.+)$/${1}keyPassword = $2/mg;
    s/^(\s*)signingConfig\s+(?!=)(.+)$/${1}signingConfig = $2/mg;
    s/^(\s*)shrinkResources\s+(?!=)(.+)$/${1}shrinkResources = $2/mg;
    s/^(\s*)minifyEnabled\s+(?!=)(.+)$/${1}minifyEnabled = $2/mg;
    s/^(\s*)crunchPngs\s+(?!=)(.+)$/${1}crunchPngs = $2/mg;
    s/^(\s*)useLegacyPackaging\s+(?!=)(.+)$/${1}useLegacyPackaging = $2/mg;
    s/^(\s*)ignoreAssetsPattern\s+(?!=)(.+)$/${1}ignoreAssetsPattern = $2/mg;
    s/^(\s*)implementation\s+jscFlavor\s*$/${1}implementation(jscFlavor)/mg;
  ' "$app_gradle"
}

java_candidate_has_javac17() {
  local candidate="$1"
  if [ -x "$candidate/bin/javac" ]; then
    "$candidate/bin/javac" -version 2>&1 | grep -q "javac 17\\."
  else
    return 1
  fi
}

pick_java_home() {
  local candidate=""
  for candidate in "${JAVA_HOME_CANDIDATES[@]}"; do
    if java_candidate_has_javac17 "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

configure_node_env() {
  if [ -z "${NODE_ENV:-}" ]; then
    NODE_ENV="$BUILD_NODE_ENV"
  fi
  export NODE_ENV
  log "Using NODE_ENV=$NODE_ENV for Expo CLI and Metro."
}

# -------------------------------------------------------------------------
# System Dependency Installation
# -------------------------------------------------------------------------

cd "$PROJECT_ROOT"

configure_node_env

maybe_install_system_packages

# Install Node.js (v20 LTS recommended for SDK 57)
if ! command_exists node; then
  if [ "$INSTALL_SYSTEM_DEPS" = "1" ] && can_run_root_cmd; then
    log "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | if command_exists sudo; then sudo -E bash -; else bash -; fi
    run_root_cmd apt-get install -y nodejs
  else
    log "Node.js not found. Install Node.js 20.x manually or rerun with HOOT_MOBILE_INSTALL_SYSTEM_DEPS=1."
    exit 1
  fi
fi

# -------------------------------------------------------------------------
# Android SDK Setup
# -------------------------------------------------------------------------

export ANDROID_HOME="$ANDROID_HOME_DIR"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

SELECTED_JAVA_HOME="$(pick_java_home || true)"
if [ -n "${SELECTED_JAVA_HOME:-}" ]; then
  JAVA_HOME="$SELECTED_JAVA_HOME"
fi

if [ -n "${JAVA_HOME:-}" ] && java_candidate_has_javac17 "$JAVA_HOME"; then
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
  log "Using JAVA_HOME=$JAVA_HOME"
else
  log "No Java 17 compiler found."
  log "Install openjdk-17-jdk and set JAVA_HOME, or rerun with HOOT_MOBILE_INSTALL_SYSTEM_DEPS=1."
  exit 1
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  log "Setting up Android SDK..."
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -L -o "$ANDROID_HOME/$ANDROID_TOOLS_ZIP" "https://dl.google.com/android/repository/$ANDROID_TOOLS_ZIP"
  unzip -q "$ANDROID_HOME/$ANDROID_TOOLS_ZIP" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -f "$ANDROID_HOME/$ANDROID_TOOLS_ZIP"

  log "Installing Android commandline tools packages and accepting licenses..."
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
fi

# -------------------------------------------------------------------------
# Project Build Logic
# -------------------------------------------------------------------------

log "Installing project dependencies..."
warn_if_node_modules_is_not_writable
run_npm_install

if [ -x "$EXPO_CLI" ]; then
  log "Using local Expo CLI."
else
  EXPO_CLI="npx"
  log "Local Expo CLI not found; falling back to npx."
fi

log "Generating native Android project..."
# Prebuild generates the 'android' folder required for a local build.
if [ "$EXPO_CLI" = "npx" ]; then
  "$EXPO_CLI" expo prebuild --platform android --no-install
else
  "$EXPO_CLI" prebuild --platform android --no-install
fi

if [ ! -d "$PROJECT_ROOT/android" ]; then
  echo "Error: Android project folder was not created."
  exit 1
fi

normalize_generated_android_xml
normalize_generated_android_gradle

log "Building APK..."
clear_react_bundle_cache
(
  cd android
  ./gradlew :app:createBundleReleaseJsAndAssets :app:packageRelease --rerun-tasks
)

if [ -d "$PROJECT_ROOT/android/app/build/generated/assets/react/release" ] || [ -d "$PROJECT_ROOT/android/app/build/intermediates/sourcemaps/react/release" ]; then
  log "Bundle outputs were refreshed and packaged."
fi

log "Build complete. APK can be found in: android/app/build/outputs/apk/release/"

if [ ! -f "android/app/build/outputs/apk/release/app-release.apk" ] && [ ! -f "android/app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
  log "Warning: expected APK output not found in android/app/build/outputs/apk/release/"
fi

# end of debian-build-hoot-mobile-android.sh
