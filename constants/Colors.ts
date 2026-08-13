/*
    Project: Hoot Unfathomably
    --------------------------

    File: Colors.ts

    Purpose:

        Define the native client's safe fallback palette.

    Responsibilities:

        - Preserve Unfathomably's oxblood, black, gray, and galaxy-blue fallback
        - Define accessible light and dark variants for interactive controls
        - Provide strongly typed color names consumed by components

    This file intentionally does not contain:

        • Instance theme loading (handled by services/InstanceThemeService.ts)
        • Network or API request logic
*/

export type ColorsObject = {
  background: string;
  secondaryBackground: string;
  tertiaryBackground: string;
  text: string;
  secondaryText: string;
  placeholderText: string;
  brandMark: string;
  tint: string;
  onTint: string;
  secondaryTint: string;
  onSecondaryTint: string;
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

export const UNFATHOMABLY_BRAND = {
  mark: "#0482d8",
  primary: "#7e0000",
  primaryDark: "#f87271",
} as const;

const Colors: { light: ColorsObject; dark: ColorsObject } = {
  light: {
    background: "#f8fafa",
    secondaryBackground: "#f1f6f5",
    tertiaryBackground: "#dde8e8",
    text: "#111827",
    secondaryText: "#425050",
    placeholderText: "#687474",
    brandMark: UNFATHOMABLY_BRAND.mark,
    tint: UNFATHOMABLY_BRAND.primary,
    onTint: "#ffffff",
    secondaryTint: "#0369b1",
    onSecondaryTint: "#ffffff",
    red: "#dc2626",
    orange: "#b45309",
    yellow: "#854d0e",
    green: "#15803d",
    teal: "#0f766e",
    blue: "#0369b1",
    indigo: "#4f46e5",
    purple: "#7e22ce",
    tabIconDefault: "#50576b",
    tabIconSelected: UNFATHOMABLY_BRAND.primary,
    tabBar: "#f8fafa",
  },
  dark: {
    background: "#000000",
    secondaryBackground: "#121212",
    tertiaryBackground: "#250000",
    text: "#f8fafa",
    secondaryText: "#b8c4c4",
    placeholderText: "#858585",
    brandMark: UNFATHOMABLY_BRAND.mark,
    tint: UNFATHOMABLY_BRAND.primaryDark,
    onTint: "#000000",
    secondaryTint: "#4db4f7",
    onSecondaryTint: "#000000",
    red: "#f87271",
    orange: "#f59e0b",
    yellow: "#facc15",
    green: "#4ade80",
    teal: "#5eead4",
    blue: "#4db4f7",
    indigo: "#818cf8",
    purple: "#c084fc",
    tabIconDefault: "#b8c4c4",
    tabIconSelected: UNFATHOMABLY_BRAND.primaryDark,
    tabBar: "#000000",
  },
};

export default Colors;

/* end of Colors.ts */
