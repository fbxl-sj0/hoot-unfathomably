/*
    Project: Hoot Unfathomably
    --------------------------

    File: InstanceThemeProvider.tsx

    Purpose:

        Keep the native palette synchronized with the active server's public
        Soapbox or Unfathomably frontend configuration.

    Responsibilities:

        - Select the theme for the active account host
        - Show cached colors immediately when they are available
        - Refresh configuration without blocking application startup
        - Prevent an old host request from changing a newly selected account

    This file intentionally does NOT contain:

        - Theme parsing or color calculations
        - Network request implementation
        - Account selection controls
*/

import React, { ReactNode, useEffect, useMemo, useState } from "react";

import { useLotideCtx } from "../hooks/useLotideCtx";
import useColorScheme from "../hooks/useColorScheme";
import { InstanceThemeContext } from "../hooks/useTheme";
import {
  InstanceThemeConfiguration,
  loadCachedInstanceTheme,
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
  const configuration = loadedTheme && loadedTheme.apiUrl === apiUrl
    ? loadedTheme.configuration
    : undefined;

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

    return () => {
      active = false;
    };
  }, [apiUrl]);

  const theme = useMemo(
    () => resolveInstanceTheme(configuration, systemColorScheme),
    [configuration, systemColorScheme],
  );

  return (
    <InstanceThemeContext.Provider value={theme}>
      {children}
    </InstanceThemeContext.Provider>
  );
}

/* end of InstanceThemeProvider.tsx */
