/*
    Project: Hoot Unfathomably
    --------------------------

    File: ReportScreen.tsx

    Purpose:

        Collect and submit a deliberate Fediverse moderation report.

    Responsibilities:

        - Select a standard report category
        - Collect optional moderator context
        - Choose whether a remote report should be forwarded
        - Confirm success before leaving the screen

    This file intentionally does NOT contain:

        - automatic reporting
        - block or mute actions
        - moderation API request construction
*/

import React, { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import { SCROLL_FORM_BOTTOM_PADDING } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  FediverseReportCategory,
  reportAccountOrStatus,
} from "../services/UnfathomablySafetyService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

const categories: { label: string; value: FediverseReportCategory }[] = [
  { label: "Violates server rules", value: "violation" },
  { label: "Spam", value: "spam" },
  { label: "Other concern", value: "other" },
];

export default function ReportScreen({
  navigation,
  route,
}: RootStackScreenProps<"Report">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [category, setCategory] =
    useState<FediverseReportCategory>("violation");
  const [comment, setComment] = useState("");
  const [forward, setForward] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (!ctx?.login) return <SuggestLogin />;

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await reportAccountOrStatus(ctx!, {
        accountId: route.params.accountId,
        category,
        comment,
        forward,
        statusIds: route.params.statusId ? [route.params.statusId] : undefined,
      });
      Alert.alert(
        "Report sent",
        "Your server's moderators received the report.",
        [{ text: "Done", onPress: () => navigation.goBack() }],
      );
    } catch (reason) {
      Alert.alert("Could not send report", getErrorMessage(reason));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        Report {route.params.statusId ? "post by" : "account"} @
        {route.params.accountLabel || route.params.accountId}
      </Text>
      <Text secondary>
        Nothing is sent until you press Send report. Your server's moderators
        decide what action is appropriate.
      </Text>
      <Text style={styles.label}>Reason</Text>
      <View style={styles.choices}>
        {categories.map(item => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === item.value }}
            key={item.value}
            onPress={() => setCategory(item.value)}
            style={[
              styles.choice,
              {
                borderColor:
                  category === item.value
                    ? theme.tint
                    : theme.tertiaryBackground,
              },
              category === item.value && {
                backgroundColor: theme.secondaryBackground,
              },
            ]}
          >
            <Text>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Notes for moderators</Text>
      <TextInput
        accessibilityLabel="Notes for moderators"
        maxLength={1_000}
        multiline
        onChangeText={setComment}
        placeholder="Explain what happened and where moderators should look"
        style={styles.comment}
        textAlignVertical="top"
        value={comment}
      />
      <Pressable
        accessibilityLabel="Forward report to the remote server"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: forward }}
        onPress={() => setForward(value => !value)}
        style={[styles.choice, { borderColor: theme.tertiaryBackground }]}
      >
        <Text>
          {forward ? "☑" : "☐"} Also send this report to the account's server
        </Text>
      </Pressable>
      <AppButton
        color={theme.red}
        disabled={submitting}
        fullWidth
        onPress={() => void submit()}
        title={submitting ? "Sending..." : "Send report"}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  title: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 17, fontWeight: "700" },
  choices: { gap: 8 },
  choice: {
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  comment: { minHeight: 140, paddingTop: 12 },
});

/* end of ReportScreen.tsx */
