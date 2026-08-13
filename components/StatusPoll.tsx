/*
    Project: Hoot Unfathomably
    --------------------------

    File: StatusPoll.tsx

    Purpose:

        Render and vote in a Mastodon-compatible status poll.

    Responsibilities:

        - Keep poll selection state local to its status card
        - Enforce single-choice and multiple-choice behavior
        - Submit bounded option indexes through the shared API service
        - Present results without assuming every server reports voter counts

    This file intentionally does NOT contain:

        - status navigation
        - poll authoring controls
        - notification handling
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import {
  UnfathomablyPoll,
  voteOnPoll,
} from "../services/UnfathomablyService";
import { getErrorMessage } from "../utils/error";
import { Text, View } from "./Themed";

function pollIsClosed(poll: UnfathomablyPoll): boolean {
  if (poll.expired) return true;
  if (!poll.expires_at) return false;
  const expiresAt = Date.parse(poll.expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function resultPercent(votes: number | null | undefined, total: number): number {
  if (!votes || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((votes / total) * 100)));
}

export default function StatusPoll({
  ctx,
  poll,
}: {
  ctx: LotideContext;
  poll: UnfathomablyPoll;
}) {
  const theme = useTheme();
  const [current, setCurrent] = useState(poll);
  const [choices, setChoices] = useState<number[]>(poll.own_votes || []);
  const [submitting, setSubmitting] = useState(false);
  const closed = pollIsClosed(current);
  const showResults = closed || current.voted === true;

  function toggleChoice(index: number) {
    if (closed || current.voted || submitting) return;
    setChoices(selected => {
      if (!current.multiple) return selected[0] === index ? [] : [index];
      return selected.includes(index)
        ? selected.filter(choice => choice !== index)
        : [...selected, index];
    });
  }

  async function submitVote() {
    if (choices.length === 0 || submitting || closed || current.voted) return;
    setSubmitting(true);
    try {
      const updated = await voteOnPoll(ctx, current.id, choices);
      setCurrent(updated);
      setChoices(updated.own_votes || choices);
    } catch (error) {
      Alert.alert("Could not vote", getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      {current.options.map((option, index) => {
        const selected = choices.includes(index);
        const percent = resultPercent(option.votes_count, current.votes_count);

        return (
          <Pressable
            accessibilityRole={showResults ? "text" : "checkbox"}
            accessibilityLabel={`${option.title}${showResults ? `, ${percent} percent` : ""}`}
            accessibilityState={showResults ? undefined : { checked: selected }}
            disabled={showResults || submitting}
            key={`${index}:${option.title}`}
            onPress={event => {
              event.stopPropagation();
              toggleChoice(index);
            }}
            style={[
              styles.option,
              {
                backgroundColor: selected
                  ? theme.tertiaryBackground
                  : theme.secondaryBackground,
                borderColor: selected ? theme.tint : theme.tertiaryBackground,
              },
            ]}
          >
            {showResults ? (
              <View
                pointerEvents="none"
                style={[
                  styles.resultBar,
                  {
                    backgroundColor: theme.tertiaryBackground,
                    width: `${percent}%`,
                  },
                ]}
              />
            ) : null}
            <Icon
              name={
                selected
                  ? current.multiple
                    ? "checkbox-outline"
                    : "radio-button-on-outline"
                  : current.multiple
                    ? "square-outline"
                    : "radio-button-off-outline"
              }
              color={selected ? theme.tint : theme.secondaryText}
              size={21}
            />
            <Text style={styles.optionText}>{option.title}</Text>
            {showResults ? <Text style={styles.percent}>{percent}%</Text> : null}
          </Pressable>
        );
      })}

      {!showResults ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit poll vote"
          accessibilityState={{ disabled: choices.length === 0 || submitting }}
          disabled={choices.length === 0 || submitting}
          onPress={event => {
            event.stopPropagation();
            void submitVote();
          }}
          style={[
            styles.vote,
            { backgroundColor: theme.tint },
            (choices.length === 0 || submitting) && styles.disabled,
          ]}
        >
          <Text style={[styles.voteText, { color: theme.background }]}>
            {submitting ? "Voting..." : "Vote"}
          </Text>
        </Pressable>
      ) : null}

      <Text secondary style={styles.summary}>
        {current.votes_count} vote{current.votes_count === 1 ? "" : "s"}
        {current.voters_count !== undefined && current.voters_count !== null
          ? ` from ${current.voters_count} voter${current.voters_count === 1 ? "" : "s"}`
          : ""}
        {closed ? " · Poll closed" : current.multiple ? " · Choose one or more" : " · Choose one"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, marginTop: 12 },
  option: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 48,
    overflow: "hidden",
    paddingHorizontal: 11,
  },
  resultBar: {
    bottom: 0,
    left: 0,
    opacity: 0.75,
    position: "absolute",
    top: 0,
  },
  optionText: { flex: 1, fontSize: 15, fontWeight: "600", marginLeft: 8 },
  percent: { fontWeight: "700", marginLeft: 8 },
  vote: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 110,
    paddingHorizontal: 18,
  },
  voteText: { fontSize: 16, fontWeight: "700" },
  summary: { fontSize: 12 },
  disabled: { opacity: 0.5 },
});

/* end of StatusPoll.tsx */
