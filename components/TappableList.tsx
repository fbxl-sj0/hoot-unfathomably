/*
    Project: Hoot Mobile
    -------------------

    File: TappableList.tsx

    Purpose:

        Render a themed list of tappable settings/profile rows.

    Responsibilities:

        - Display icons, labels, and disabled state
        - Invoke row actions consistently

    This file intentionally does NOT contain:

        - screen-specific settings logic
        - data fetching
*/

import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
  Text,
  View,
} from "react-native";
import Icon from "@expo/vector-icons/Ionicons";
import useTheme from "../hooks/useTheme";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";

export type TappableListProps = {
  items: TappableListItem[];
  style?: StyleProp<ViewStyle>;
};

export type Glyph = keyof typeof Icon.glyphMap;

export interface TappableListItem {
  title: string;
  icon?: Glyph;
  disabled?: boolean;
  onPress: () => void;
}

export function TappableList(props: TappableListProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.secondaryBackground },
        props.style,
      ]}
    >
      {props.items.map((item, i) => (
        <Pressable
          key={i}
          accessibilityLabel={item.title}
          accessibilityRole="button"
          accessibilityState={{ disabled: item.disabled || false }}
          style={[styles.item]}
          onPress={item.onPress}
          disabled={item.disabled}
        >
          <Icon
            name={item.icon || "help-outline"}
            size={20}
            color={item.disabled ? theme.secondaryText : theme.tint}
          />
          <View
            style={[
              styles.itemInner,
              i !== 0 && {
                borderTopColor: theme.secondaryText,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <Text
              style={{
                color: item.disabled ? theme.secondaryText : theme.text,
              }}
            >
              {item.title}
            </Text>
            <Icon
              name="chevron-forward-outline"
              color={
                item.disabled ? theme.tertiaryBackground : theme.secondaryText
              }
              size={20}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export default TappableList;

const styles = StyleSheet.create({
  root: {
    borderRadius: 8,
  },
  item: {
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingLeft: 15,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemInner: {
    paddingVertical: 12,
    marginLeft: 15,
    paddingRight: 15,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

/* end of TappableList.tsx */
