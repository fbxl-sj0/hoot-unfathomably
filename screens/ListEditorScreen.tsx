/*
    Project: Hoot Unfathomably
    --------------------------

    File: ListEditorScreen.tsx

    Purpose:

        Create or edit a standard Fediverse account list.

    Responsibilities:

        - Edit title, reply policy, and exclusive-list behavior
        - Submit create and update requests
        - Confirm deletion of an existing list

    This file intentionally does NOT contain:

        - list membership
        - list timeline rendering
        - account search
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
  createList,
  deleteList,
  FediverseList,
  FediverseListRepliesPolicy,
  updateList,
} from "../services/UnfathomablyListsService";
import { getErrorMessage } from "../utils/error";

export default function ListEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { list?: FediverseList } };
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const existing = route.params?.list;
  const [title, setTitle] = useState(existing?.title || "");
  const [repliesPolicy, setRepliesPolicy] =
    useState<FediverseListRepliesPolicy>(existing?.replies_policy || "list");
  const [exclusive, setExclusive] = useState(existing?.exclusive === true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  if (!ctx?.login) return <SuggestLogin />;

  async function save() {
    if (savingRef.current || !title.trim()) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (existing) {
        await updateList(ctx!, existing.id, {
          exclusive,
          repliesPolicy,
          title,
        });
      } else {
        await createList(ctx!, { exclusive, repliesPolicy, title });
      }
      navigation.goBack();
    } catch (reason) {
      Alert.alert("Could not save list", getErrorMessage(reason));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!existing || savingRef.current) return;
    Alert.alert(
      `Delete ${existing.title}?`,
      "The custom timeline will be removed. Accounts in it are not unfollowed.",
      [
        { text: "Keep list", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteList(ctx!, existing.id)
              .then(() => {
                if (navigation.popTo) navigation.popTo("Lists");
                else navigation.goBack();
              })
              .catch(reason =>
                Alert.alert("Could not delete list", getErrorMessage(reason)),
              );
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text secondary>List name</Text>
      <TextInput
        accessibilityLabel="List name"
        autoFocus
        maxLength={200}
        onChangeText={setTitle}
        placeholder="Friends, projects, local news…"
        style={styles.nameInput}
        value={title}
      />
      <Text secondary>Show replies when the replied-to account is</Text>
      <View style={styles.choices}>
        {(
          [
            ["list", "In this list"],
            ["followed", "Followed by you"],
            ["none", "Never show replies"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: repliesPolicy === value }}
            key={value}
            onPress={() => setRepliesPolicy(value)}
            style={[
              styles.choice,
              repliesPolicy === value && { backgroundColor: theme.tint },
            ]}
          >
            <Text
              style={
                repliesPolicy === value ? { color: theme.onTint } : undefined
              }
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityLabel="Keep accounts in this list out of the home timeline"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: exclusive }}
        onPress={() => setExclusive(value => !value)}
        style={[
          styles.exclusive,
          exclusive && { backgroundColor: theme.secondaryBackground },
        ]}
      >
        <Text style={styles.exclusiveTitle}>Exclusive list</Text>
        <Text secondary>
          When supported, posts from these accounts appear here instead of Home.
        </Text>
      </Pressable>
      <AppButton
        disabled={!title.trim() || saving}
        fullWidth
        onPress={() => void save()}
        title={saving ? "Saving..." : existing ? "Save list" : "Create list"}
      />
      {existing ? (
        <AppButton
          color={theme.red}
          fullWidth
          onPress={confirmDelete}
          title="Delete list"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  nameInput: { fontSize: 17, minHeight: 50 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  exclusive: { borderRadius: 10, gap: 4, minHeight: 70, padding: 12 },
  exclusiveTitle: { fontSize: 16, fontWeight: "700" },
});

/* end of ListEditorScreen.tsx */
