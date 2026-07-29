/*
    Project: Hoot Mobile
    -------------------

    File: ElapsedTime.tsx

    Purpose:

        Display a compact relative time label.

    Responsibilities:

        - Convert server timestamps into readable elapsed time
        - Keep timestamp presentation consistent across screens

    This file intentionally does NOT contain:

        - date parsing policy outside display needs
        - network requests
*/

import { Ionicons as Icon } from "@expo/vector-icons";
import React from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import useElapsedTime from "../hooks/useElapsedTime";
import { TOUCH_TARGET_HIT_SLOP } from "../constants/TouchTargets";

export interface ElapsedTimeProps {
  time: string;
}

export default function ElapsedTime(props: ElapsedTimeProps) {
  const elapsedTime = useElapsedTime(props.time);
  return (
    <Pressable
      accessibilityLabel={`Show posted date ${props.time}`}
      accessibilityRole="button"
      hitSlop={TOUCH_TARGET_HIT_SLOP}
      onPress={() => Alert.alert("Date posted", props.time)}
    >
      <Text style={styles.root}>
        <Icon name="time-outline" size={14} /> {elapsedTime}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {},
});

/* end of ElapsedTime.tsx */
