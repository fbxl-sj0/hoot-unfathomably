/*
    Project: Hoot Unfathomably
    --------------------------

    File: AccessibilityPreferencesContext.tsx

    Purpose:

        Expose app-wide readability and motion preferences without coupling
        reusable primitives directly to Redux.

    Responsibilities:

        - Read persisted accessibility settings from application state
        - Provide stable defaults to isolated component tests
        - Keep preference consumption available below any navigation tree

    This file intentionally does NOT contain:

        - preference persistence
        - settings controls
        - component-specific layout decisions
*/

import React, { createContext, ReactNode, useContext, useMemo } from "react";
import { useSelector } from "react-redux";

import type { RootState } from "../store/reduxStore";

export type AccessibilityPreferences = {
  alwaysExpandContentWarnings: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  showMediaDescriptions: boolean;
  textScale: 1 | 1.15 | 1.3;
};

const defaults: AccessibilityPreferences = {
  alwaysExpandContentWarnings: false,
  highContrast: false,
  reduceMotion: false,
  showMediaDescriptions: false,
  textScale: 1,
};

const AccessibilityPreferencesContext = createContext(defaults);

export function AccessibilityPreferencesProvider({ children }: { children: ReactNode }) {
  const settings = useSelector((state: RootState) => state.settings);
  const value = useMemo<AccessibilityPreferences>(() => ({
    alwaysExpandContentWarnings: settings.alwaysExpandContentWarnings,
    highContrast: settings.highContrast,
    reduceMotion: settings.reduceMotion,
    showMediaDescriptions: settings.showMediaDescriptions,
    textScale: settings.textScale,
  }), [
    settings.alwaysExpandContentWarnings,
    settings.highContrast,
    settings.reduceMotion,
    settings.showMediaDescriptions,
    settings.textScale,
  ]);

  return (
    <AccessibilityPreferencesContext.Provider value={value}>
      {children}
    </AccessibilityPreferencesContext.Provider>
  );
}

export function useAccessibilityPreferences(): AccessibilityPreferences {
  return useContext(AccessibilityPreferencesContext);
}

/* end of AccessibilityPreferencesContext.tsx */
