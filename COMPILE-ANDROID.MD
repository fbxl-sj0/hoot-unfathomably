# Compiling Hoot Unfathomably for Android

Hoot Unfathomably uses a checked-in React Native Android project under
`android/`. Native Expo modules are required, so the supported workflow is a
local Android build rather than Expo Go.

## Prerequisites

- Node.js 20 or newer and npm
- OpenJDK 17
- Android SDK command-line tools, platform-tools, and build tools

The scripts locate the Android SDK through `ANDROID_SDK_ROOT`, `ANDROID_HOME`,
`~/Android/Sdk`, or `~/android-sdk`.

## Development launch

```bash
npm ci
npm run android
```

`npm run android` uses `build_scripts/android-env.sh` to select Java 17, find
the Android SDK and AVD directory, and run `expo run:android`.

## Release APK

```bash
npm run build:android
```

The APK is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The build helper only installs Debian host packages when
`HOOT_MOBILE_INSTALL_SYSTEM_DEPS=1` is explicitly set. Missing Node.js or Java
17 is otherwise reported as an environment problem.

## Device smoke test

With a phone attached or emulator already running:

```bash
npm run smoke:android -- android/app/build/outputs/apk/release/app-release.apk
```

The smoke helper installs the APK, launches
`org.brokenlamp.hootunfathomably`, confirms it becomes the foreground app, and
fails on fresh package-scoped Android, React Native, or ANR crash output. It
also checks the `POST_NOTIFICATIONS` permission and reports its Android 13+
runtime grant state.

For a fresh emulator, grant that permission before launch when notification
testing is required:

```bash
HOOT_MOBILE_GRANT_NOTIFICATIONS=1 \
  npm run smoke:android -- android/app/build/outputs/apk/release/app-release.apk
```

To have the helper create and manage an emulator:

```bash
./build_scripts/debian-test-hoot-mobile-android.sh \
  android/app/build/outputs/apk/release/app-release.apk
```

It installs qemu/libvirt host dependencies only with
`HOOT_MOBILE_INSTALL_EMULATOR_DEPS=1`.

## Release checklist

```bash
npm run verify:release
npm run build:android
npm run smoke:android -- android/app/build/outputs/apk/release/app-release.apk
```

If more than one Android device is connected, set `ANDROID_SERIAL` to the
target device before the smoke test.
