/*
    Project: Hoot Unfathomably
    --------------------------

    File: useInstanceEmoji.ts

    Purpose:

        Expose the active server's custom and configured reaction choices.

    Responsibilities:

        - Return server custom emoji to status reaction controls
        - Return configured Unicode reactions with a stable fallback

    This file intentionally does NOT contain:

        - Server requests
        - Emoji rendering
        - Reaction mutations
*/

import { useContext } from "react";

import { InstancePresentationContext } from "../contexts/InstancePresentationContext";
import { DEFAULT_QUICK_EMOJI } from "../services/InstanceThemeService";

export function useInstanceQuickEmoji(): readonly string[] {
  const presentation = useContext(InstancePresentationContext);

  return presentation?.quickEmoji ?? DEFAULT_QUICK_EMOJI;
}

/* end of useInstanceEmoji.ts */
