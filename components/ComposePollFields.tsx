/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposePollFields.tsx

    Purpose:

        Edit a bounded poll while composing a status.

    Responsibilities:

        - Maintain two to four poll option fields
        - Select single-choice or multiple-choice voting
        - Select a server-compatible expiration interval
        - Report whether the current draft is publishable

    This file intentionally does NOT contain:

        - poll network requests
        - status text or visibility fields
        - post submission state
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import { Text, TextInput, View } from "./Themed";

const MINIMUM_POLL_OPTIONS = 2;
const MAXIMUM_POLL_OPTIONS = 4;

export type ComposePollDraft = {
  expiresIn: number;
  multiple: boolean;
  options: string[];
};

export const INITIAL_POLL_DRAFT: ComposePollDraft = {
  expiresIn: 86_400,
  multiple: false,
  options: ["", ""],
};

const expirationOptions = [
  { label: "1 hour", seconds: 3_600 },
  { label: "1 day", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
];

export function pollDraftIsValid(draft: ComposePollDraft): boolean {
  return draft.options.length >= MINIMUM_POLL_OPTIONS &&
    draft.options.length <= MAXIMUM_POLL_OPTIONS &&
    draft.options.every(option => option.trim().length > 0);
}

export default function ComposePollFields({
  draft,
  onChange,
}: {
  draft: ComposePollDraft;
  onChange: (draft: ComposePollDraft) => void;
}) {
  const theme = useTheme();

  function updateOption(index: number, value: string) {
    onChange({
      ...draft,
      options: draft.options.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    });
  }

  return (
    <View style={[styles.root, { borderColor: theme.tertiaryBackground }]}>
      <Text style={styles.title}>Poll</Text>
      {draft.options.map((option, index) => (
        <View key={index} style={styles.optionRow}>
          <Icon
            name={draft.multiple ? "square-outline" : "radio-button-off-outline"}
            color={theme.secondaryText}
            size={21}
          />
          <TextInput
            accessibilityLabel={`Poll option ${index + 1}`}
            maxLength={100}
            onChangeText={value => updateOption(index, value)}
            placeholder={`Option ${index + 1}`}
            style={styles.input}
            value={option}
          />
          {draft.options.length > MINIMUM_POLL_OPTIONS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove poll option ${index + 1}`}
              onPress={() => onChange({
                ...draft,
                options: draft.options.filter((_, optionIndex) => optionIndex !== index),
              })}
              style={styles.iconButton}
            >
              <Icon name="close-outline" color={theme.secondaryText} size={24} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {draft.options.length < MAXIMUM_POLL_OPTIONS ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add poll option"
          onPress={() => onChange({ ...draft, options: [...draft.options, ""] })}
          style={styles.addOption}
        >
          <Icon name="add-outline" color={theme.tint} size={21} />
          <Text tint>Add option</Text>
        </Pressable>
      ) : null}
      <Text secondary style={styles.label}>Voting</Text>
      <View style={styles.pills}>
        {[false, true].map(multiple => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.multiple === multiple }}
            key={String(multiple)}
            onPress={() => onChange({ ...draft, multiple })}
            style={[styles.pill, draft.multiple === multiple && { backgroundColor: theme.tint }]}
          >
            <Text style={draft.multiple === multiple ? { color: theme.onTint } : undefined}>
              {multiple ? "Choose several" : "Choose one"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text secondary style={styles.label}>Closes after</Text>
      <View style={styles.pills}>
        {expirationOptions.map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.expiresIn === option.seconds }}
            key={option.seconds}
            onPress={() => onChange({ ...draft, expiresIn: option.seconds })}
            style={[styles.pill, draft.expiresIn === option.seconds && { backgroundColor: theme.tint }]}
          >
            <Text style={draft.expiresIn === option.seconds ? { color: theme.onTint } : undefined}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, gap: 9, paddingTop: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  optionRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  input: { flex: 1, minHeight: 48 },
  iconButton: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  addOption: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, minHeight: 48, paddingHorizontal: 5 },
  label: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: { borderRadius: 18, justifyContent: "center", minHeight: 44, paddingHorizontal: 13 },
});

/* end of ComposePollFields.tsx */
