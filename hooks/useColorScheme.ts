/*
    Project: Hoot Mobile
    -------------------

    File: useColorScheme.ts

    Purpose:

        Normalize the platform color-scheme value for app themes.

    Responsibilities:

        - Return only light or dark
        - Avoid nullable platform color values leaking into theme code

    This file intentionally does NOT contain:

        - theme token definitions
        - settings storage
*/

import { useColorScheme as _useColorScheme } from 'react-native';

export type AppColorScheme = "light" | "dark";

export default function useColorScheme(): AppColorScheme {
  return _useColorScheme() === "dark" ? "dark" : "light";
}

/* end of useColorScheme.ts */
