/*
    Project: Hoot Mobile
    -------------------

    File: useTheme.ts

    Purpose:

        Return the active Hoot color palette.

    Responsibilities:

        - Combine color-scheme detection with theme tokens

    This file intentionally does NOT contain:

        - theme token definitions
        - platform color APIs
*/

import Colors from "../constants/Colors";
import useColorScheme from "./useColorScheme";

export default function useTheme() {
  const colorScheme = useColorScheme();
  return Colors[colorScheme];
}

/* end of useTheme.ts */
