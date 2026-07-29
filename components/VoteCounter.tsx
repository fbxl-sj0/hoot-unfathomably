/*
    Project: Hoot Mobile
    -------------------

    File: VoteCounter.tsx

    Purpose:

        Render and update post or comment vote state.

    Responsibilities:

        - Display score and vote state
        - Apply or remove votes through the vote hook
        - Show disabled state for anonymous users

    This file intentionally does NOT contain:

        - post/comment fetching
        - feed pagination
*/

import { Ionicons as Icon } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { View, Text } from "./Themed";
import useTheme from "../hooks/useTheme";
import * as Haptics from "../services/HapticService";
import useVote from "../hooks/useVote";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";

export interface VoteCounterProps {
  content: Post | Comment;
  type: ContentType;
  hideCount?: boolean;
  style?: StyleProp<ViewStyle>;
  onVote?: (isUpvote: boolean) => void;
}

export default function VoteCounter(props: VoteCounterProps) {
  const theme = useTheme();
  const ctx = useLotideCtx();
  const { isUpvoted, isVoting, addVote, removeVote } = useVote(
    props.type,
    props.content,
  );

  function toggleVote() {
    if (isVoting) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!ctx?.login) {
      Alert.alert(
        "Login to like",
        "Leave a like when you login to a community",
      );
      return;
    }

    if (isUpvoted) {
      removeVote();
    } else {
      addVote();
    }
  }

  const scoreColor = isUpvoted ? theme.red : theme.text;

  return (
    <Pressable
      accessibilityLabel={isUpvoted ? "Remove like" : "Like"}
      accessibilityRole="button"
      accessibilityState={{ disabled: isVoting }}
      disabled={isVoting}
      onPress={() => toggleVote()}
      hitSlop={TOUCH_TARGET_HIT_SLOP}
      style={[styles.touchTarget, isVoting && styles.disabled, props.style]}
    >
      <View style={styles.content}>
        <Icon
          name={isUpvoted ? "heart" : "heart-outline"}
          color={scoreColor}
          size={25}
        />
        {!props.hideCount && (
          <Text
            style={{ ...styles.score, color: scoreColor }}
          >{`  ${props.content.score}  `}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: MINIMUM_TOUCH_TARGET_SIZE,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  content: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
  },
  score: {
    fontSize: 18,
    minWidth: 28,
  },
  disabled: {
    opacity: 0.6,
  },
});

/* end of VoteCounter.tsx */
