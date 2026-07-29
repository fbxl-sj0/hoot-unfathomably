/*
    Project: Hoot Mobile
    -------------------

    File: AppErrorBoundary.tsx

    Purpose:

        Provide a last-resort recovery screen for uncaught React render
        failures in the mobile application.

    Responsibilities:

        - Catch render-time errors below the root component
        - Log the error for development and device log inspection
        - Show an accessible, touch-friendly recovery action

    This file intentionally does NOT contain:

        - Native crash handling
        - Async task error handling
        - Screen-specific retry logic
*/

import React from "react";
import { StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import { logError } from "../utils/debugLog";
import AppButton from "./AppButton";
import { Text, View } from "./Themed";

/* ------------------------------------------------------------------------- */
/* Types                                                                     */
/* ------------------------------------------------------------------------- */

type AppErrorBoundaryTheme = {
  background: string;
  secondaryBackground: string;
  secondaryText: string;
  text: string;
  tint: string;
};

type AppErrorBoundaryProps = {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  theme: AppErrorBoundaryTheme;
};

type AppErrorBoundaryState = {
  errorMessage: string | undefined;
};

/* ------------------------------------------------------------------------- */
/* Error Boundary                                                            */
/* ------------------------------------------------------------------------- */

class AppErrorBoundaryInner extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    errorMessage: undefined,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      errorMessage: error.message || "Unexpected application error",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError("Uncaught Hoot render error", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  retry = () => {
    this.setState({
      errorMessage: undefined,
    });
  };

  render() {
    const { errorMessage } = this.state;
    const { children, theme } = this.props;

    if (!errorMessage) {
      return children;
    }

    return (
      <View
        accessibilityRole="summary"
        style={[
          styles.root,
          {
            backgroundColor: theme.background,
          },
        ]}
      >
        <View
          style={[
            styles.panel,
            {
              backgroundColor: theme.secondaryBackground,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Hoot hit a problem
          </Text>
          <Text
            accessibilityLiveRegion="assertive"
            style={[styles.message, { color: theme.secondaryText }]}
          >
            Something went wrong while drawing the app. Try again to reload the
            current screen.
          </Text>
          <Text style={[styles.detail, { color: theme.secondaryText }]}>
            {errorMessage}
          </Text>
          <AppButton
            title="Try Again"
            onPress={this.retry}
            color={theme.tint}
            fullWidth
            style={styles.button}
          />
        </View>
      </View>
    );
  }
}

export type AppErrorBoundaryPublicProps = {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
};

export default function AppErrorBoundary({
  children,
  onError,
}: AppErrorBoundaryPublicProps) {
  const theme = useTheme();

  return (
    <AppErrorBoundaryInner onError={onError} theme={theme}>
      {children}
    </AppErrorBoundaryInner>
  );
}

/* ------------------------------------------------------------------------- */
/* Styles                                                                    */
/* ------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  panel: {
    borderRadius: 8,
    maxWidth: 460,
    padding: 20,
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 12,
  },
  detail: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 18,
  },
  button: {
    marginTop: 2,
  },
});

/* end of AppErrorBoundary.tsx */
