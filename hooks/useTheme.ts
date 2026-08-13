/*
    Project: Hoot Mobile
    -------------------

    File: useTheme.ts

    Purpose:

        Return the active server-aware Hoot color palette.

    Responsibilities:

        - Expose instance theme values to application components
        - Fall back to the platform scheme outside the theme provider

    This file intentionally does NOT contain:

        - theme token definitions
        - frontend configuration requests
*/

import { createContext, useContext } from "react";

import Colors from "../constants/Colors";
import type { ColorsObject } from "../constants/Colors";
import useColorScheme from "./useColorScheme";
import { useAccessibilityPreferences } from "../contexts/AccessibilityPreferencesContext";

export type InstanceThemeContextValue = {
  colorScheme: "light" | "dark";
  colors: ColorsObject;
};

export const InstanceThemeContext = createContext<
  InstanceThemeContextValue | undefined
>(undefined);

export default function useTheme() {
  const instanceTheme = useContext(InstanceThemeContext);
  const systemColorScheme = useColorScheme();
  const { highContrast } = useAccessibilityPreferences();
  const colorScheme = instanceTheme?.colorScheme ?? systemColorScheme;
  const colors = instanceTheme?.colors ?? Colors[systemColorScheme];

  if (!highContrast) return colors;

  return {
    ...colors,
    background: colorScheme === "dark" ? "#000000" : "#ffffff",
    placeholderText: colorScheme === "dark" ? "#d1d5db" : "#374151",
    secondaryBackground: colorScheme === "dark" ? "#111111" : "#f3f4f6",
    secondaryText: colorScheme === "dark" ? "#ffffff" : "#111111",
    tabBar: colorScheme === "dark" ? "#000000" : "#ffffff",
    tertiaryBackground: colorScheme === "dark" ? "#3f3f46" : "#9ca3af",
    text: colorScheme === "dark" ? "#ffffff" : "#000000",
  };
}

export function useInstanceColorScheme(): "light" | "dark" {
  const instanceTheme = useContext(InstanceThemeContext);
  const systemColorScheme = useColorScheme();

  return instanceTheme?.colorScheme ?? systemColorScheme;
}

/* end of useTheme.ts */
