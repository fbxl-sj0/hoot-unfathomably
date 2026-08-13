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

  return instanceTheme?.colors ?? Colors[systemColorScheme];
}

export function useInstanceColorScheme(): "light" | "dark" {
  const instanceTheme = useContext(InstanceThemeContext);
  const systemColorScheme = useColorScheme();

  return instanceTheme?.colorScheme ?? systemColorScheme;
}

/* end of useTheme.ts */
