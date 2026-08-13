/*
    Project: Hoot Mobile
    -------------------

    File: useTheme.ts

    Purpose:

        Return active server-aware presentation settings.

    Responsibilities:

        - Expose instance theme and quick-reaction values to components
        - Fall back to the platform scheme outside the theme provider

    This file intentionally does NOT contain:

        - theme token definitions
        - frontend configuration requests
*/

import { useContext } from "react";

import Colors from "../constants/Colors";
import { InstancePresentationContext } from "../contexts/InstancePresentationContext";
import useColorScheme from "./useColorScheme";
import { useAccessibilityPreferences } from "../contexts/AccessibilityPreferencesContext";

export default function useTheme() {
  const instanceTheme = useContext(InstancePresentationContext);
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
  const instanceTheme = useContext(InstancePresentationContext);
  const systemColorScheme = useColorScheme();

  return instanceTheme?.colorScheme ?? systemColorScheme;
}

/* end of useTheme.ts */
