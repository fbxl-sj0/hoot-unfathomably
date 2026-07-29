/*
    Project: Hoot Mobile
    -------------------

    File: check-android-native-metadata.js

    Purpose:

        Verify that checked-in Android native metadata still mirrors the
        app.json Expo configuration that Hoot treats as canonical.

    Responsibilities:

        - Compare package id, version, app name, scheme, and orientation
        - Compare Android permission declarations
        - Compare generated color/string metadata for icon, splash, and system UI
        - Reject app-local Gradle syntax that Gradle 10 will remove
        - Fail with actionable messages when native Android files drift

    This file intentionally does NOT contain:

        - Android project generation
        - APK build logic
        - Expo Doctor replacement checks outside Hoot's mirrored metadata
*/

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const gradleAssignmentProperties = [
  "ndkVersion",
  "buildToolsVersion",
  "compileSdk",
  "namespace",
  "applicationId",
  "minSdkVersion",
  "targetSdkVersion",
  "versionCode",
  "versionName",
  "storeFile",
  "storePassword",
  "keyAlias",
  "keyPassword",
  "signingConfig",
  "shrinkResources",
  "minifyEnabled",
  "crunchPngs",
  "useLegacyPackaging",
  "ignoreAssetsPattern",
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readUtf8(relativePath));
}

function normalizeAndroidPermission(permission) {
  if (permission.startsWith("android.permission.")) {
    return permission;
  }

  return `android.permission.${permission}`;
}

function requireString(value, context) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }

  return value;
}

function requireNumber(value, context) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${context} must be an integer`);
  }

  return value;
}

function matchOne(text, pattern, context) {
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Could not find ${context}`);
  }

  return match[1];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchGradleStringProperty(gradle, propertyName, context) {
  const escapedName = escapeRegExp(propertyName);

  return matchOne(
    gradle,
    new RegExp(`\\b${escapedName}\\s*(?:=\\s*)?['"]([^'"]+)['"]`),
    context,
  );
}

function matchGradleIntegerProperty(gradle, propertyName, context) {
  const escapedName = escapeRegExp(propertyName);

  return Number(matchOne(
    gradle,
    new RegExp(`\\b${escapedName}\\s*(?:=\\s*)?([0-9]+)`),
    context,
  ));
}

function readExpoConfig() {
  const appJson = readJson("app.json");
  const expo = appJson.expo;

  if (!expo || typeof expo !== "object" || Array.isArray(expo)) {
    throw new Error("app.json must contain an expo object");
  }

  const android = expo.android;
  if (!android || typeof android !== "object" || Array.isArray(android)) {
    throw new Error("app.json expo.android must be an object");
  }

  const splashPlugin = Array.isArray(expo.plugins)
    ? expo.plugins.find(plugin =>
      Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
    )
    : undefined;
  const splashOptions = Array.isArray(splashPlugin) &&
    splashPlugin[1] &&
    typeof splashPlugin[1] === "object" &&
    !Array.isArray(splashPlugin[1])
    ? splashPlugin[1]
    : {};

  return {
    name: requireString(expo.name, "expo.name"),
    version: requireString(expo.version, "expo.version"),
    orientation: requireString(expo.orientation, "expo.orientation"),
    scheme: requireString(expo.scheme, "expo.scheme"),
    userInterfaceStyle: requireString(
      expo.userInterfaceStyle,
      "expo.userInterfaceStyle",
    ),
    androidPackage: requireString(
      android.package,
      "expo.android.package",
    ),
    androidPermissions: Array.isArray(android.permissions)
      ? android.permissions.map(permission =>
        normalizeAndroidPermission(
          requireString(permission, "expo.android.permissions[]"),
        ),
      )
      : [],
    versionCode: requireNumber(
      android.versionCode,
      "expo.android.versionCode",
    ),
    adaptiveIconBackgroundColor: requireString(
      android.adaptiveIcon?.backgroundColor,
      "expo.android.adaptiveIcon.backgroundColor",
    ),
    splashBackgroundColor: requireString(
      splashOptions.backgroundColor,
      "expo-splash-screen.backgroundColor",
    ),
  };
}

function readGradleMetadata() {
  const gradle = readUtf8("android/app/build.gradle");

  return {
    namespace: matchGradleStringProperty(
      gradle,
      "namespace",
      "android namespace",
    ),
    applicationId: matchGradleStringProperty(
      gradle,
      "applicationId",
      "android applicationId",
    ),
    versionCode: matchGradleIntegerProperty(
      gradle,
      "versionCode",
      "android versionCode",
    ),
    versionName: matchGradleStringProperty(
      gradle,
      "versionName",
      "android versionName",
    ),
  };
}

function readManifestMetadata() {
  const manifest = readUtf8("android/app/src/main/AndroidManifest.xml");
  const permissionPattern = /<uses-permission\b[^>]*android:name="([^"]+)"/g;
  const permissions = [];
  let match;

  while ((match = permissionPattern.exec(manifest)) !== null) {
    permissions.push(match[1]);
  }

  return {
    permissions,
    screenOrientation: matchOne(
      manifest,
      /android:screenOrientation="([^"]+)"/,
      "MainActivity screenOrientation",
    ),
    schemes: Array.from(
      manifest.matchAll(/<data\b[^>]*android:scheme="([^"]+)"/g),
      item => item[1],
    ),
  };
}

function readStringResources() {
  const strings = readUtf8("android/app/src/main/res/values/strings.xml");

  return {
    appName: matchOne(
      strings,
      /<string\s+name="app_name">([^<]+)<\/string>/,
      "app_name string",
    ),
    systemUiStyle: matchOne(
      strings,
      /<string\s+name="expo_system_ui_user_interface_style"[^>]*>([^<]+)<\/string>/,
      "expo_system_ui_user_interface_style string",
    ),
  };
}

function readColorResources() {
  const colors = readUtf8("android/app/src/main/res/values/colors.xml");

  return {
    splashBackground: matchOne(
      colors,
      /<color\s+name="splashscreen_background">([^<]+)<\/color>/,
      "splashscreen_background color",
    ),
    iconBackground: matchOne(
      colors,
      /<color\s+name="iconBackground">([^<]+)<\/color>/,
      "iconBackground color",
    ),
  };
}

function findGradleModernSyntaxProblems(relativePath, gradle) {
  const problems = [];
  const lines = gradle.split(/\r?\n/);
  const propertyPatterns = gradleAssignmentProperties.map(propertyName => ({
    propertyName,
    pattern: new RegExp(`^\\s*${escapeRegExp(propertyName)}\\s+(?!=).+$`),
  }));

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("//") || trimmedLine.startsWith("*")) {
      return;
    }

    if (/^\s*maven\s*\{\s*url\s+['"]/.test(line)) {
      problems.push(
        `${relativePath}:${lineNumber}: use Gradle assignment syntax for Maven repository url`,
      );
    }

    if (/^\s*implementation\s+jscFlavor\s*$/.test(line)) {
      problems.push(
        `${relativePath}:${lineNumber}: use implementation(jscFlavor) instead of Gradle command shorthand`,
      );
    }

    for (const property of propertyPatterns) {
      if (property.pattern.test(line)) {
        problems.push(
          `${relativePath}:${lineNumber}: use Gradle assignment syntax for ${property.propertyName}`,
        );
      }
    }
  });

  return problems;
}

function checkGradleModernSyntax() {
  const files = [
    "android/build.gradle",
    "android/app/build.gradle",
  ];

  return files.flatMap(relativePath =>
    findGradleModernSyntaxProblems(relativePath, readUtf8(relativePath)),
  );
}

function expectEqual(problems, label, actual, expected) {
  if (actual !== expected) {
    problems.push(`${label}: expected ${expected}, found ${actual}`);
  }
}

function checkNativeMetadata() {
  const expo = readExpoConfig();
  const gradle = readGradleMetadata();
  const manifest = readManifestMetadata();
  const strings = readStringResources();
  const colors = readColorResources();
  const problems = checkGradleModernSyntax();

  expectEqual(problems, "android namespace", gradle.namespace, expo.androidPackage);
  expectEqual(
    problems,
    "android applicationId",
    gradle.applicationId,
    expo.androidPackage,
  );
  expectEqual(
    problems,
    "android versionName",
    gradle.versionName,
    expo.version,
  );
  expectEqual(
    problems,
    "android versionCode",
    gradle.versionCode,
    expo.versionCode,
  );
  expectEqual(problems, "android app_name", strings.appName, expo.name);
  expectEqual(
    problems,
    "android screenOrientation",
    manifest.screenOrientation,
    expo.orientation,
  );
  expectEqual(
    problems,
    "android system UI style",
    strings.systemUiStyle,
    expo.userInterfaceStyle,
  );
  expectEqual(
    problems,
    "android splash background",
    colors.splashBackground.toLowerCase(),
    expo.splashBackgroundColor.toLowerCase(),
  );
  expectEqual(
    problems,
    "android adaptive icon background",
    colors.iconBackground.toLowerCase(),
    expo.adaptiveIconBackgroundColor.toLowerCase(),
  );

  if (!manifest.schemes.includes(expo.scheme)) {
    problems.push(
      `android deep-link scheme: expected ${expo.scheme}, found ${manifest.schemes.join(", ") || "none"}`,
    );
  }

  for (const permission of expo.androidPermissions) {
    if (!manifest.permissions.includes(permission)) {
      problems.push(`android permission ${permission} is missing from AndroidManifest.xml`);
    }
  }

  return problems;
}

function main() {
  const problems = checkNativeMetadata();

  if (problems.length > 0) {
    process.stderr.write("Android native metadata check failed:\n");
    for (const problem of problems) {
      process.stderr.write(`  ${problem}\n`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkNativeMetadata,
  findGradleModernSyntaxProblems,
};

/* end of check-android-native-metadata.js */
