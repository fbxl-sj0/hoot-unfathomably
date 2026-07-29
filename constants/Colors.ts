/*
    Project: Hoot Mobile
    -------------------

    File: Colors.ts

    Purpose:

        Centralized theme tokens used by the app and styling utilities.

    Responsibilities:

        • Define default light/dark color palettes
        • Provide strongly typed color names consumed by components

    This file intentionally does not contain:

        • Theme switching logic (handled by hooks/useTheme.ts)
        • Network or API request logic
*/

export type ColorsObject = {
  background: string;
  secondaryBackground: string;
  tertiaryBackground: string;
  text: string;
  secondaryText: string;
  placeholderText: string;
  tint: string;
  secondaryTint: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  teal: string;
  blue: string;
  indigo: string;
  purple: string;
  tabIconDefault: string;
  tabIconSelected: string;
  tabBar: string;
};

const sharedPalette = {
  red: "#ff6b6b",
  orange: "#ff9f43",
  yellow: "#f5a524",
  green: "#2ecc71",
  teal: "#48dbfb",
  blue: "#2e86de",
  indigo: "#5f5ce5",
  purple: "#a855f7",
  tint: "#f5a524",
  secondaryTint: "#ff9f43",
};

const Colors = {
  light: {
    background: "#ffffff",
    secondaryBackground: "#f1f5f9",
    tertiaryBackground: "#e2e8f0",
    text: "#111827",
    secondaryText: "#6b7280",
    placeholderText: "#94a3b8",
    tabIconDefault: "#687076",
    tabIconSelected: sharedPalette.tint,
    tabBar: "#ffffff",
    ...sharedPalette,
  },
  dark: {
    background: "#000000",
    secondaryBackground: "#181818",
    tertiaryBackground: "#242424",
    text: "#f1f5f9",
    secondaryText: "#94a3b8",
    placeholderText: "#64748b",
    tabIconDefault: "#9ca3af",
    tabIconSelected: sharedPalette.tint,
    tabBar: "#000000",
    ...sharedPalette,
  },
};

export default Colors;

/* end of Colors.ts */
