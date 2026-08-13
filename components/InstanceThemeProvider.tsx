/*
    Project: Hoot Unfathomably
    --------------------------

    File: InstanceThemeProvider.tsx

    Purpose:

        Keep the native palette synchronized with the active server's public
        Soapbox or Unfathomably frontend configuration.

    Responsibilities:

        - Select the presentation settings for the active account host
        - Show cached colors and quick reactions when they are available
        - Refresh configuration without blocking application startup
        - Prevent an old host request from changing a newly selected account

    This file intentionally does NOT contain:

        - Theme parsing or color calculations
        - Network request implementation
        - Account selection controls
*/

import React, { ReactNode, useEffect, useMemo, useState } from "react";

import { InstancePresentationContext } from "../contexts/InstancePresentationContext";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useColorScheme from "../hooks/useColorScheme";
import {
  DEFAULT_QUICK_EMOJI,
  InstanceThemeConfiguration,
  loadCachedInstanceQuickEmoji,
  loadCachedInstanceTheme,
  refreshInstanceQuickEmoji,
  refreshInstanceTheme,
  resolveInstanceTheme,
} from "../services/InstanceThemeService";

export default function InstanceThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = useLotideCtx();
  const systemColorScheme = useColorScheme();
  const apiUrl = ctx?.apiUrl;
  const [loadedTheme, setLoadedTheme] = useState<{
    apiUrl: string;
    configuration: InstanceThemeConfiguration;
  } | undefined>(undefined);
  const [loadedQuickEmoji, setLoadedQuickEmoji] = useState<{
    apiUrl: string;
    emoji: string[];
  } | undefined>(undefined);
  const configuration = loadedTheme && loadedTheme.apiUrl === apiUrl
    ? loadedTheme.configuration
    : undefined;
  const quickEmoji = loadedQuickEmoji && loadedQuickEmoji.apiUrl === apiUrl
    ? loadedQuickEmoji.emoji
    : configuration?.quickEmoji;

  useEffect(() => {
    let active = true;

    if (!apiUrl) {
      return () => {
        active = false;
      };
    }

    loadCachedInstanceTheme(apiUrl).then(cached => {
      if (active && cached) {
        setLoadedTheme({ apiUrl, configuration: cached });
      }
    });

    refreshInstanceTheme(apiUrl).then(current => {
      if (active && current) {
        setLoadedTheme({ apiUrl, configuration: current });
      }
    });

    loadCachedInstanceQuickEmoji(apiUrl).then(emoji => {
      if (active && emoji) setLoadedQuickEmoji({ apiUrl, emoji });
    });

    refreshInstanceQuickEmoji(apiUrl).then(emoji => {
      if (active && emoji) setLoadedQuickEmoji({ apiUrl, emoji });
    });

    return () => {
      active = false;
    };
  }, [apiUrl]);

  const presentation = useMemo(
    () => ({
      ...resolveInstanceTheme(configuration, systemColorScheme),
      quickEmoji: quickEmoji ?? DEFAULT_QUICK_EMOJI,
    }),
    [configuration, quickEmoji, systemColorScheme],
  );

  return (
    <InstancePresentationContext.Provider value={presentation}>
      {children}
    </InstancePresentationContext.Provider>
  );
}

/* end of InstanceThemeProvider.tsx */
