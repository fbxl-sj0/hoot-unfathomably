/*
    Project: Hoot Unfathomably
    -------------------

    File: jest.config.js

    Purpose:

        Defines the Jest runtime used by the React Native and Expo unit tests.

    Responsibilities:

        • Use the current Jest runner and transformer packages
        • Preserve React Native and Expo module mocks
        • Map native packages that have multiple install locations

    This file intentionally does NOT contain:

        • Per-test network fixtures
        • Application runtime configuration
        • Assertions or test data
*/

const fs = require("fs");
const path = require("path");

const reactNativePreset = require("@react-native/jest-preset");
const { resolveBabelOptions } = require("jest-expo/src/resolveBabelOptions");

const mappedExpoModulesCore = fs.existsSync(
  path.join(__dirname, "node_modules", "expo-modules-core"),
)
  ? path.join(__dirname, "node_modules", "expo-modules-core")
  : path.join(__dirname, "node_modules", "expo", "node_modules", "expo-modules-core");

module.exports = {
  haste: reactNativePreset.haste,
  resolver: reactNativePreset.resolver,
  testEnvironment: "node",
  testEnvironmentOptions: {
    customExportConditions: ["require", "react-native"],
  },
  setupFiles: reactNativePreset.setupFiles,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/unfathomably/"],
  moduleNameMapper: {
    ...reactNativePreset.moduleNameMapper,
    "^react-native-vector-icons$": "@expo/vector-icons",
    "^react-native-vector-icons/(.*)": "@expo/vector-icons/$1",
    "^expo-modules-core$": mappedExpoModulesCore,
    "^expo-modules-core/(.*)$": `${mappedExpoModulesCore}/$1`,
  },
  transform: {
    "\\.[jt]sx?$": [
      require.resolve("babel-jest"),
      resolveBabelOptions(__dirname),
    ],
    "^.+\\.(bmp|gif|jpg|jpeg|png|psd|svg|webp|xml|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|yaml|yml|otf|ttf|zip|heic|avif|db)$":
      require.resolve("jest-expo/src/preset/assetFileTransformer.js"),
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|react-redux|@reduxjs/toolkit|immer))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};

/* end of jest.config.js */
