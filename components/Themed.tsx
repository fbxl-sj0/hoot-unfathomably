/*
    Project: Hoot Mobile
    -------------------

    File: Themed.tsx

    Purpose:

        Provide basic themed React Native primitives.

    Responsibilities:

        - Apply app theme colors to text, views, and inputs
        - Keep shared primitive styling centralized

    This file intentionally does NOT contain:

        - screen layout
        - business logic
*/

/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */

import React, { forwardRef } from "react";
import {
  ColorValue,
  Text as DefaultText,
  View as DefaultView,
  TextInput as DefaultTextInput,
  StyleSheet,
} from "react-native";

import type { ColorsObject } from "../constants/Colors";
import useTheme, { useInstanceColorScheme } from "../hooks/useTheme";
import { useAccessibilityPreferences } from "../contexts/AccessibilityPreferencesContext";

const BaseTextSizeContext = React.createContext(14);

export function useThemeColor(
  props: { light?: ColorValue; dark?: ColorValue },
  colorName: keyof ColorsObject,
): ColorValue {
  const colorScheme = useInstanceColorScheme();
  const theme = useTheme();
  const colorFromProps = props[colorScheme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return theme[colorName];
  }
}

type ThemeProps = {
  secondary?: boolean;
  tint?: boolean;
};

export type TextProps = ThemeProps & DefaultText["props"];
export type ViewProps = ThemeProps & DefaultView["props"];

export function Text(props: TextProps) {
  const { style, secondary, tint, ...otherProps } = props;
  const theme = useTheme();
  const parentTextSize = React.useContext(BaseTextSizeContext);
  const { textScale } = useAccessibilityPreferences();
  const flattenedStyle = StyleSheet.flatten(style);
  const baseFontSize = typeof flattenedStyle?.fontSize === "number"
    ? flattenedStyle.fontSize
    : parentTextSize;
  const scaledTextStyle = textScale === 1 ? undefined : {
    fontSize: baseFontSize * textScale,
    lineHeight: typeof flattenedStyle?.lineHeight === "number"
      ? flattenedStyle.lineHeight * textScale
      : undefined,
  };
  const color =
    !secondary && !tint
      ? theme.text
      : secondary && !tint
      ? theme.secondaryText
      : tint && !secondary
      ? theme.tint
      : theme.secondaryTint;

  return (
    <DefaultText
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[{ color }, style, scaledTextStyle]}
      {...otherProps}
    >
      <BaseTextSizeContext.Provider value={baseFontSize}>
        {props.children}
      </BaseTextSizeContext.Provider>
    </DefaultText>
  );
}

export function View(props: ViewProps) {
  const { style, ...otherProps } = props;
  const backgroundColor = useTheme().background;

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}

export const TextInput = forwardRef<
  DefaultTextInput,
  DefaultTextInput["props"]
>((props: DefaultTextInput["props"], ref) => {
  const { style, placeholderTextColor, ...otherProps } = props;
  const theme = useTheme();
  const { textScale } = useAccessibilityPreferences();

  const themeStyle = {
    backgroundColor: theme.secondaryBackground,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    color: theme.text,
    fontSize: 14 * textScale,
  };
  return (
    <DefaultTextInput
      ref={ref}
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[themeStyle, style]}
      placeholderTextColor={placeholderTextColor || theme.placeholderText}
      {...otherProps}
    />
  );
});
TextInput.displayName = "TextInput";

/* end of Themed.tsx */
