/*
    Project: Hoot Mobile
    -------------------

    File: eslint.config.js

    Purpose:

        Provide ESLint flat-config setup for the current toolchain and
        project conventions.

    Responsibilities:

        • Load Expo's official base config for React Native/Expo projects
        • Enable Jest recommendations for test files
        • Centralize ignored paths in a version-safe format

    This file intentionally does NOT contain:

        • App business logic
        • Build system configuration
        • Automated formatting policy decisions
*/

const expoConfig = require("eslint-config-expo/flat");
const jestPlugin = require("eslint-plugin-jest");
const globals = require("globals");

function withoutReactPluginRules(config) {
  if (!config.rules) return config;

  return {
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules).filter(
        ([ruleName]) => !ruleName.startsWith("react/"),
      ),
    ),
  };
}

module.exports = [
  ...expoConfig.map(withoutReactPluginRules),
  jestPlugin.configs["flat/recommended"],
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ["**/node_modules/**", "**/android/**", "**/dist/**", "**/.expo/**", "unfathomably/**"],
  },
];

/* end of eslint.config.js */
