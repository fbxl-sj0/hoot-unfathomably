/*
    Project: Hoot Unfathomably
    --------------------------

    File: App.tsx

    Purpose:

        The entry point for the Hoot Mobile application. Manages initialization,
        account persistence and the root navigation structure.

    Responsibilities:

        • Bootstrapping the application (Provider, StatusBar)
        • Loading cached resources and persistence data
        • Restoring the active Unfathomably account
        • Managing application state via Redux

    This file intentionally does NOT contain:

        • Specific screen implementations
        • Direct API request logic (see services/UnfathomablyService)
*/

import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import useCachedResources from "./hooks/useCachedResources";
import useColorScheme from "./hooks/useColorScheme";
import Navigation from "./navigation";
import * as StorageService from "./services/StorageService";
import * as UnfathomablyService from "./services/UnfathomablyService";
import * as NotificationPoller from "./services/NotificationPoller";
import { Provider, useDispatch } from "react-redux";
import { setCtx } from "./slices/lotideSlice";
import { setAppSettings } from "./slices/settingsSlice";
import reduxStore from "./store/reduxStore";
import { useLotideCtx } from "./hooks/useLotideCtx";
import { Alert, Platform } from "react-native";
import { getErrorMessage } from "./utils/error";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { logWarning } from "./utils/debugLog";

/* ------------------------------------------------------------------------- */
/* Main Application Component                                                */
/* ------------------------------------------------------------------------- */

function App() {
  const isLoadingComplete = useCachedResources();
  const colorScheme = useColorScheme();
  const ctx = useLotideCtx();
  const dispatch = useDispatch();
  const notificationOnboardingStartedRef = useRef(false);

  /* ------------------------------------------------------------------------- */
  /* Initialization and Persistence                                            */
  /* ------------------------------------------------------------------------- */

  /* ------------------------------------------------------------------------- */
  /* Stored Context Loading                                                    */
  /* ------------------------------------------------------------------------- */

  useEffect(() => {
    StorageService.lotideContext
      .query()
      .then(ctx => {
        if (ctx !== undefined) {
          /*
             A pre-migration Hoot session points at Lotide's /api/unstable
             surface and cannot authenticate against the Mastodon API. Clear
             it once so the account picker starts at a valid server URL.
          */
          if (/\/api\/unstable\/?$/i.test(ctx.apiUrl || "")) {
            return StorageService.lotideContext.store({})
              .then(() => StorageService.lotideContextKV.store({}))
              .then(() => dispatch(setCtx({})));
          }
          dispatch(setCtx(ctx));
        }
      })
      .catch(error => {
        logWarning(
          "Failed to load stored account context",
          getErrorMessage(error),
        );
      });
  }, [dispatch]);

  useEffect(() => {
    StorageService.appSettings
      .query()
      .then(settings => {
        dispatch(setAppSettings(settings));
      })
      .catch(error => {
        logWarning("Failed to load app settings", getErrorMessage(error));
      });
  }, [dispatch]);

  /* ------------------------------------------------------------------------- */
  /* API Synchronization                                                       */
  /* ------------------------------------------------------------------------- */

  useEffect(() => {
    if (!ctx?.apiUrl) return;

    let isActive = true;

    UnfathomablyService.getInstance(ctx.apiUrl)
      .then(() => {
        if (!isActive) return;
      })
      .catch(e => {
        if (!isActive) return;

        Alert.alert("Cannot refresh server info", getErrorMessage(e));
      });

    return () => {
      isActive = false;
    };
  }, [ctx]);

  useEffect(() => {
    NotificationPoller.registerNotificationPollTask().catch(error => {
      logWarning(
        "Failed to restore background notifications",
        getErrorMessage(error),
      );
    });
  }, [ctx?.login?.token]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!ctx?.login) return;
    if (notificationOnboardingStartedRef.current) return;

    notificationOnboardingStartedRef.current = true;
    let isActive = true;

    Promise.all([
      NotificationPoller.getNotificationOnboardingPrompted(),
      NotificationPoller.getNotificationEnabled(),
    ])
      .then(async ([alreadyPrompted, alreadyEnabled]) => {
        if (alreadyPrompted) return;

        await NotificationPoller.markNotificationOnboardingPrompted();
        if (!isActive || alreadyEnabled) return;

        Alert.alert(
          "Turn on notifications?",
          "Hoot Unfathomably can check your account in the background and alert you about new activity. You can change this later in Options → App settings.",
          [
            {
              text: "Not now",
              style: "cancel",
            },
            {
              text: "Enable notifications",
              onPress: () => {
                NotificationPoller.setNotificationEnabled(true, ctx).catch(
                  error => {
                    if (!isActive) return;

                    Alert.alert(
                      "Cannot enable notifications",
                      getErrorMessage(error),
                    );
                  },
                );
              },
            },
          ],
        );
      })
      .catch(error => {
        logWarning(
          "Failed to run notification onboarding",
          getErrorMessage(error),
        );
      });

    return () => {
      isActive = false;
    };
  }, [ctx]);

  /* ------------------------------------------------------------------------- */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------- */

  if (!isLoadingComplete) {
    return null;
  } else {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Navigation colorScheme={colorScheme} />
          <StatusBar />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }
}

/**
    Root component provides the Redux store to the application.
*/
export default function AppRoot() {
  return (
    <AppErrorBoundary>
      <Provider store={reduxStore}>
        <App />
      </Provider>
    </AppErrorBoundary>
  );
}

/* end of App.tsx */
