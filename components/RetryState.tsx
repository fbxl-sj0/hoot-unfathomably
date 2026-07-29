/*
    Project: Hoot Mobile
    -------------------

    File: RetryState.tsx

    Purpose:

        Render a consistent recovery state when a screen or list cannot
        load data from the Lotide API.

    Responsibilities:

        • Show a friendly failure message
        • Provide an accessible retry action
        • Keep retry styling consistent across screens

    This file intentionally does NOT contain:

        • API request logic
        • Screen-specific loading state
        • Alert or navigation behavior
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { Text, View } from "./Themed";

export interface RetryStateProps {
  message: string;
  onRetry: () => void;
  actionLabel?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function RetryState({
  message,
  onRetry,
  actionLabel = "Retry",
  compact = false,
  style,
}: RetryStateProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.root,
        compact ? styles.compact : undefined,
        { backgroundColor: "#00000000" },
        style,
      ]}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.message, { color: theme.secondaryText }]}
      >
        {message}
      </Text>
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        hitSlop={TOUCH_TARGET_HIT_SLOP}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.tint, opacity: pressed ? 0.74 : 1 },
        ]}
      >
        <Icon name="refresh-outline" size={18} color="#111827" />
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  compact: {
    alignItems: "flex-start",
    padding: 0,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
    textAlign: "center",
  },
  button: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
  },
});

/* end of RetryState.tsx */
