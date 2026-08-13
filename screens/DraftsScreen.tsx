/*
    Project: Hoot Unfathomably
    --------------------------

    File: DraftsScreen.tsx

    Purpose:

        List and reopen complete local composer drafts for the active account.

    Responsibilities:

        - Refresh account-scoped drafts whenever the screen gains focus
        - Explain reply, quote, group, schedule, and ordinary draft context
        - Reopen a selected draft in the reusable composer
        - Confirm and remove an unwanted draft

    This file intentionally does NOT contain:

        - draft serialization
        - post publication
        - server-side scheduled statuses
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  composeDrafts,
  ComposeDraft,
} from "../services/ComposeDraftService";
import { removeAllComposeDraftMedia } from "../services/ComposeDraftMediaService";

function draftContext(draft: ComposeDraft): string {
  if (draft.inReplyToId) return "Reply draft";
  if (draft.quoteId) return "Quote-post draft";
  if (draft.groupName) return `Group draft for ${draft.groupName}`;
  if (draft.scheduledAt) return "Scheduled-post draft";
  return "Post draft";
}

export default function DraftsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [drafts, setDrafts] = useState<ComposeDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setLoading(true);
    try {
      setDrafts(await composeDrafts.list(ctx));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  if (!ctx?.login) return <SuggestLogin />;

  function removeDraft(draft: ComposeDraft) {
    Alert.alert(
      "Delete this draft?",
      "This removes the local copy from this account and cannot be undone.",
      [
        { text: "Keep draft", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeAllComposeDraftMedia(draft.media);
            void composeDrafts.remove(ctx!, draft.id).then(() => {
              setDrafts(current => current.filter(item => item.id !== draft.id));
            });
          },
        },
      ],
    );
  }

  return (
    <FlatList
      contentContainerStyle={drafts.length === 0 ? styles.emptyList : undefined}
      data={drafts}
      keyExtractor={draft => draft.id}
      onRefresh={() => void load()}
      refreshing={loading}
      ListEmptyComponent={loading ? null : (
        <View style={styles.empty}>
          <Icon name="document-text-outline" color={theme.secondaryText} size={42} />
          <Text style={styles.emptyTitle}>No saved drafts</Text>
          <Text secondary style={styles.emptyText}>
            Posts you save or leave unfinished will appear here for this account.
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={[styles.row, { borderColor: theme.tertiaryBackground }]}>
          <Pressable
            accessibilityLabel={`Open ${draftContext(item)}`}
            accessibilityRole="button"
            onPress={() => navigation.navigate("Root", {
              screen: "NewPostScreen",
              params: { draftId: item.id },
            })}
            style={styles.body}
          >
            <Text style={styles.kind}>{draftContext(item)}</Text>
            <Text numberOfLines={3}>
              {item.content.trim() || item.contentWarning.trim() || "Untitled draft"}
            </Text>
            <Text secondary>
              Updated {new Date(item.updatedAt).toLocaleString()}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Delete ${draftContext(item)}`}
            accessibilityRole="button"
            onPress={() => removeDraft(item)}
            style={styles.deleteButton}
          >
            <Icon name="trash-outline" color={theme.red} size={23} />
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  emptyList: { flexGrow: 1 },
  empty: { alignItems: "center", flex: 1, gap: 8, justifyContent: "center", padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptyText: { textAlign: "center" },
  row: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", paddingLeft: 16 },
  body: { flex: 1, gap: 5, minHeight: 94, paddingVertical: 13 },
  kind: { fontSize: 16, fontWeight: "700" },
  deleteButton: { alignItems: "center", justifyContent: "center", minHeight: 56, minWidth: 56 },
});

/* end of DraftsScreen.tsx */
