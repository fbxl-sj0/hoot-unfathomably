/*
    Project: Hoot Unfathomably
    --------------------------

    File: ScheduledPostsScreen.tsx

    Purpose:

        Review, reschedule, and cancel server-side scheduled posts.

    Responsibilities:

        - Load the selected account's standard scheduled-status collection
        - Show the pending source text and local publication time
        - Reschedule through the platform date/time picker
        - Confirm cancellation before deleting a pending publication

    This file intentionally does NOT contain:

        - local composer drafts
        - Android background alarms
        - automatic client-side publication
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import ComposeScheduleFields from "../components/ComposeScheduleFields";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";
import { getErrorMessage } from "../utils/error";

export default function ScheduledPostsScreen() {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [items, setItems] = useState<Unfathomably.UnfathomablyScheduledStatus[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [editingAt, setEditingAt] = useState<string>();
  const [saving, setSaving] = useState(false);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!ctx?.login || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      setItems(await Unfathomably.getScheduledStatuses(ctx));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [ctx]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  if (!ctx?.login) return <SuggestLogin />;

  async function saveSchedule(item: Unfathomably.UnfathomablyScheduledStatus) {
    if (!editingAt || saving) return;
    setSaving(true);
    try {
      const updated = await Unfathomably.updateScheduledStatus(
        ctx!,
        item.id,
        editingAt,
      );
      setItems(current => current.map(existing =>
        existing.id === item.id ? updated : existing,
      ));
      setEditingId(undefined);
      setEditingAt(undefined);
    } catch (reason) {
      Alert.alert("Could not reschedule", getErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  function cancel(item: Unfathomably.UnfathomablyScheduledStatus) {
    Alert.alert(
      "Cancel this scheduled post?",
      "The server will permanently remove it from the publication queue.",
      [
        { text: "Keep scheduled", style: "cancel" },
        {
          text: "Cancel post",
          style: "destructive",
          onPress: () => {
            void Unfathomably.cancelScheduledStatus(ctx!, item.id)
              .then(() => {
                setItems(current => current.filter(existing => existing.id !== item.id));
              })
              .catch(reason => {
                Alert.alert("Could not cancel scheduled post", getErrorMessage(reason));
              });
          },
        },
      ],
    );
  }

  return (
    <FlatList
      contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
      data={items}
      keyExtractor={item => item.id}
      onRefresh={() => void load()}
      refreshing={loading}
      ListEmptyComponent={error ? (
        <RetryState message={error} onRetry={() => void load()} />
      ) : loading ? null : (
        <View style={styles.empty}>
          <Icon name="time-outline" color={theme.secondaryText} size={42} />
          <Text style={styles.emptyTitle}>Nothing scheduled</Text>
          <Text secondary style={styles.emptyText}>
            Use Schedule for later in the composer to publish at a future time.
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const isEditing = editingId === item.id;
        return (
          <View style={[styles.row, { borderColor: theme.tertiaryBackground }]}>
            <Text style={styles.date}>
              {new Date(item.scheduled_at).toLocaleString()}
            </Text>
            {item.params.spoiler_text ? (
              <Text secondary>Warning: {item.params.spoiler_text}</Text>
            ) : null}
            <Text>{item.params.text || "Media post"}</Text>
            {isEditing ? (
              <View style={styles.editor}>
                <ComposeScheduleFields
                  onChange={setEditingAt}
                  value={editingAt}
                />
                <View style={styles.actions}>
                  <AppButton
                    color={theme.secondaryTint}
                    onPress={() => {
                      setEditingId(undefined);
                      setEditingAt(undefined);
                    }}
                    title="Close"
                  />
                  <AppButton
                    disabled={!editingAt || saving}
                    onPress={() => void saveSchedule(item)}
                    title={saving ? "Saving..." : "Save new time"}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel="Change scheduled publication time"
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingId(item.id);
                    setEditingAt(item.scheduled_at);
                  }}
                  style={styles.iconAction}
                >
                  <Icon name="calendar-outline" color={theme.tint} size={23} />
                  <Text tint>Change time</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Cancel scheduled post"
                  accessibilityRole="button"
                  onPress={() => cancel(item)}
                  style={styles.iconAction}
                >
                  <Icon name="trash-outline" color={theme.red} size={23} />
                  <Text style={{ color: theme.red }}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  emptyList: { flexGrow: 1 },
  empty: { alignItems: "center", flex: 1, gap: 8, justifyContent: "center", padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptyText: { textAlign: "center" },
  row: { borderBottomWidth: 1, gap: 8, padding: 16 },
  date: { fontSize: 17, fontWeight: "700" },
  editor: { gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" },
  iconAction: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 48, paddingHorizontal: 8 },
});

/* end of ScheduledPostsScreen.tsx */
