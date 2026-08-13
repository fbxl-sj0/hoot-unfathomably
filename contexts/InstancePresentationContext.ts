/*
    Project: Hoot Unfathomably
    --------------------------

    File: InstancePresentationContext.ts

    Purpose:

        Share the active server's native presentation settings.

    Responsibilities:

        - Define the colors and emoji selected for the active host
        - Provide one context boundary for theme and reaction hooks

    This file intentionally does NOT contain:

        - Network requests
        - Cache management
        - Component rendering
*/

import { createContext } from "react";

import type { ColorsObject } from "../constants/Colors";

export type InstancePresentationContextValue = {
  colorScheme: "light" | "dark";
  colors: ColorsObject;
  quickEmoji: readonly string[];
};

export const InstancePresentationContext = createContext<
  InstancePresentationContextValue | undefined
>(undefined);

/* end of InstancePresentationContext.ts */
