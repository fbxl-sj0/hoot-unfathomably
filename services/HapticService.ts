/*
    Project: Hoot Mobile
    -------------------

    File: HapticService.ts

    Purpose:

        Wrap platform haptic feedback calls.

    Responsibilities:

        - Skip haptics on web
        - Expose the subset of Expo haptics used by the UI
        - Keep native haptic failures from becoming interaction failures

    This file intentionally does NOT contain:

        - gesture handling
        - business logic
*/

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { logWarning } from "../utils/debugLog";

export { ImpactFeedbackStyle } from "expo-haptics";

export async function impactAsync(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === "web") return;

  try {
    await Haptics.impactAsync(style);
  } catch (error) {
    logWarning("Haptic feedback failed", error);
  }
}

/* end of HapticService.ts */
