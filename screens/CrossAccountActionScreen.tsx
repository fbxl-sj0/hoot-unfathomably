/*
    Project: Hoot Unfathomably
    --------------------------

    File: CrossAccountActionScreen.tsx

    Purpose:

        React to one federated post from selected saved accounts.

    Responsibilities:

        - Select an explicit set of authenticated accounts
        - Resolve the post independently on every selected home server
        - Apply a favourite, repost, or emoji reaction
        - Report partial success without repeating completed actions

    This file intentionally does NOT contain:

        - credential storage
        - search endpoint compatibility details
        - automatic bulk actions
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import ComposeAccountPicker from "../components/ComposeAccountPicker";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import { SCROLL_FORM_BOTTOM_PADDING } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  getSavedAuthenticatedAccounts,
  resolveSelectedAccountContexts,
  SavedAuthenticatedAccount,
} from "../services/SavedAccountService";
import * as Unfathomably from "../services/UnfathomablyService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

type ActionKind = "emoji" | "favourite" | "repost";

export default function CrossAccountActionScreen({
  route,
}: RootStackScreenProps<"CrossAccountAction">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [status, setStatus] = useState<Unfathomably.UnfathomablyStatus>();
  const [accounts, setAccounts] = useState<SavedAuthenticatedAccount[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [kind, setKind] = useState<ActionKind>("favourite");
  const [emoji, setEmoji] = useState("❤️");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setError("");
    try {
      const [nextStatus, nextAccounts] = await Promise.all([
        Unfathomably.getStatus(ctx, route.params.statusId),
        getSavedAuthenticatedAccounts(ctx),
      ]);
      setStatus(nextStatus);
      setAccounts(nextAccounts);
      setSelectedKeys(
        nextAccounts
          .filter(account => account.isActive)
          .map(account => account.key),
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }, [ctx, route.params.statusId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!ctx?.login) return <SuggestLogin />;
  if (!status) {
    return error ? (
      <RetryState message={error} onRetry={() => void load()} />
    ) : (
      <Text style={styles.loading}>Loading accounts...</Text>
    );
  }

  async function applyAction(
    account: SavedAuthenticatedAccount,
    sourceUrl: string,
  ) {
    const resolved = await Unfathomably.resolveStatusByUrl(
      account.context,
      sourceUrl,
    );
    if (kind === "repost") {
      await Unfathomably.reblogStatus(account.context, resolved.id);
    } else if (kind === "emoji") {
      await Unfathomably.reactToStatus(
        account.context,
        resolved.id,
        emoji.trim(),
      );
    } else {
      await Unfathomably.favouriteStatus(account.context, resolved.id);
    }
  }

  async function run() {
    if (runningRef.current) return;
    const sourceAddress = status?.uri || status?.url;
    if (!sourceAddress) {
      Alert.alert(
        "Post cannot be resolved",
        "This server did not provide the post's federated address.",
      );
      return;
    }
    if (kind === "emoji" && !emoji.trim()) {
      Alert.alert(
        "Choose an emoji",
        "Enter one emoji or a server reaction name.",
      );
      return;
    }

    runningRef.current = true;
    setRunning(true);
    const selected = await resolveSelectedAccountContexts(ctx!, selectedKeys);
    const results = await Promise.allSettled(
      selected.map(account => applyAction(account, sourceAddress)),
    );
    const failedKeys = selected
      .filter((_account, index) => results[index].status === "rejected")
      .map(account => account.key);
    const failureDetails = selected.flatMap((account, index) => {
      const result = results[index];
      return result.status === "rejected"
        ? [`@${account.account.acct}: ${getErrorMessage(result.reason)}`]
        : [];
    });
    setSelectedKeys(failedKeys.length > 0 ? failedKeys : selectedKeys);
    runningRef.current = false;
    setRunning(false);

    if (failureDetails.length === 0) {
      Alert.alert(
        "Action complete",
        `Updated ${selected.length} account${selected.length === 1 ? "" : "s"}.`,
      );
    } else {
      Alert.alert(
        results.some(result => result.status === "fulfilled")
          ? "Some accounts failed"
          : "Action failed",
        failureDetails.join("\n").slice(0, 2_000),
      );
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>React to @{status.account.acct}'s post</Text>
      {accounts.length < 2 ? (
        <Text secondary>
          Add another account from the More tab before using cross-account
          actions.
        </Text>
      ) : null}
      <ComposeAccountPicker
        accounts={accounts}
        label="Act from"
        onChange={setSelectedKeys}
        selectedKeys={selectedKeys}
        summary={`The selected action will run from ${selectedKeys.length} accounts.`}
      />
      <Text style={styles.label}>Action</Text>
      <View style={styles.choices}>
        {(
          [
            ["favourite", "Thumbs up"],
            ["repost", "Repost"],
            ["emoji", "Emoji reaction"],
          ] as [ActionKind, string][]
        ).map(([value, label]) => (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: kind === value }}
            key={value}
            onPress={() => setKind(value)}
            style={[
              styles.choice,
              {
                borderColor:
                  kind === value ? theme.tint : theme.tertiaryBackground,
              },
              kind === value && { backgroundColor: theme.secondaryBackground },
            ]}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
      </View>
      {kind === "emoji" ? (
        <TextInput
          accessibilityLabel="Emoji reaction"
          maxLength={80}
          onChangeText={setEmoji}
          style={styles.input}
          value={emoji}
        />
      ) : null}
      <AppButton
        disabled={running || accounts.length === 0 || selectedKeys.length === 0}
        fullWidth
        onPress={() => void run()}
        title={running ? "Working..." : "Apply selected action"}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 15,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  loading: { padding: 30, textAlign: "center" },
  title: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 17, fontWeight: "700" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  input: { minHeight: 48 },
});

/* end of CrossAccountActionScreen.tsx */
