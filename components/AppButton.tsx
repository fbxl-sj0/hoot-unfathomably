/*
    Project: Hoot Mobile
    -------------------

    File: AppButton.tsx

    Purpose:

        Render a consistently sized app action button.

    Responsibilities:

        - Provide the 48dp Android touch target expected for phone controls
        - Apply Hoot theme colors to primary and secondary actions
        - Expose accessibility state for disabled buttons

    This file intentionally does NOT contain:

        - screen-specific submit logic
        - navigation behavior
        - form validation
*/

import React from "react";
import {
  ColorValue,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from "react-native";
import { Text } from "./Themed";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
  color?: ColorValue;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  textColor?: ColorValue;
  textStyle?: StyleProp<TextStyle>;
}

export default function AppButton({
  title,
  onPress,
  accessibilityLabel,
  color,
  disabled = false,
  fullWidth = false,
  style,
  testID,
  textColor,
  textStyle,
}: AppButtonProps) {
  const theme = useTheme();
  const backgroundColor = disabled
    ? theme.tertiaryBackground
    : color ?? theme.tint;
  const foregroundColor = disabled
    ? theme.secondaryText
    : textColor ?? "#111827";

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.root,
        fullWidth ? styles.fullWidth : undefined,
        {
          backgroundColor,
          opacity: pressed && !disabled ? 0.74 : 1,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.text, { color: foregroundColor }, textStyle]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: 96,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
});

/* end of AppButton.tsx */
