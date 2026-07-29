/*
    Project: Hoot Mobile
    -------------------

    File: useCachedResources.ts

    Purpose:

        Load startup resources before the app renders.

    Responsibilities:

        - Load bundled fonts
        - Hide the splash screen after resource loading
        - Expose startup completion state

    This file intentionally does NOT contain:

        - Lotide API loading
        - navigation setup
*/

import { FontAwesome } from "@expo/vector-icons";
import * as Font from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as React from "react";

import { logWarning } from "../utils/debugLog";

export default function useCachedResources() {
  const [isLoadingComplete, setLoadingComplete] = React.useState(false);

  React.useEffect(() => {
    async function loadResourcesAndDataAsync() {
      try {
        await SplashScreen.preventAutoHideAsync();

        await Font.loadAsync({
          ...FontAwesome.font,
          "space-mono": require("../assets/fonts/SpaceMono-Regular.ttf"),
        });
      } catch (e) {
        logWarning("Failed to load startup resources", e);
      } finally {
        setLoadingComplete(true);
        SplashScreen.hideAsync().catch(e => {
          logWarning("Failed to hide splash screen", e);
        });
      }
    }

    void loadResourcesAndDataAsync();
  }, []);

  return isLoadingComplete;
}

/* end of useCachedResources.ts */
