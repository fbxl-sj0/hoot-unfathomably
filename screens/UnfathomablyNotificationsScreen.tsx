/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyNotificationsScreen.tsx

    Purpose:

        Show notification activity from the Unfathomably backend.

    Responsibilities:

        - Paginate the stable per-event notification API
        - Describe group, emoji, event, poll, and ordinary social activity
        - Open the status attached by the server when one is present

    This file intentionally does NOT contain:

        - background notification polling
        - push-token registration
        - group or event moderation actions
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { stripHtml } from "../components/StatusCard";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";

const labels: Record<string, string> = {
  favourite: "favourited your post",
  follow: "followed you",
  follow_request: "requested to follow you",
  group_favourite: "liked your group post",
  group_follow: "followed your group",
  group_follow_request: "requested to join your group",
  group_reblog: "reposted your group post",
  mention: "mentioned you",
  move: "moved to another account",
  poll: "updated a poll",
  "pleroma:chat_mention": "sent you a message",
  "pleroma:emoji_reaction": "reacted to your post",
  "pleroma:event_reminder": "reminded you about an event",
  "pleroma:event_update": "updated an event",
  "pleroma:participation_accepted": "accepted your participation request",
  "pleroma:participation_request": "requested to participate",
  reblog: "boosted your post",
  status: "posted something new",
  update: "edited a post you interacted with",
  user_approved: "approved your account",
};

function notificationLabel(item: Unfathomably.UnfathomablyNotification): string {
  const base = labels[item.type] || item.type.replace(/[_:-]+/g, " ");
  const target = item.target?.display_name || item.target?.acct;
  const targetSuffix = target && ["group_follow", "group_follow_request", "move"].includes(item.type)
    ? ` ${target}`
    : "";
  const emoji = item.type === "pleroma:emoji_reaction" && item.emoji
    ? ` ${item.emoji}`
    : "";
  return `${base}${targetSuffix}${emoji}`;
}
export default function UnfathomablyNotificationsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const [items, setItems] = useState<Unfathomably.UnfathomablyNotification[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const refresh = useCallback(async () => {
    if (!ctx?.login) return;
    setRefreshing(true);
    try {
      setError("");
      setItems(await Unfathomably.getNotifications(ctx));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load notifications.");
    } finally {
      setRefreshing(false);
    }
  }, [ctx]);

  const loadMore = useCallback(async () => {
    const lastId = items.at(-1)?.id;
    if (!ctx?.login || !lastId || refreshing || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await Unfathomably.getNotifications(ctx, lastId);
      setItems(current => [
        ...current,
        ...next.filter(item => !current.some(existing => existing.id === item.id)),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }, [ctx, items, loadingMore, refreshing]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(interval);
  }, [refresh]));

  if (!ctx?.login) return <SuggestLogin />;
  return <FlatList testID="fediverse-notifications-list" data={items} keyExtractor={item => item.id} onRefresh={() => void refresh()} refreshing={refreshing} onEndReached={() => void loadMore()} onEndReachedThreshold={0.7} ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void refresh()} /> : !refreshing ? <Text style={styles.empty}>All caught up.</Text> : null} renderItem={({ item }) => <Pressable style={styles.row} accessibilityRole={item.status ? "button" : "text"} disabled={!item.status} onPress={() => item.status && navigation.navigate("Status", { statusId: item.status.id })}>{!!item.account.avatar && <Image source={{ uri: item.account.avatar }} style={styles.avatar} />}<View style={styles.body}><Text><Text style={styles.name}>{item.account.display_name || item.account.acct}</Text> {notificationLabel(item)}</Text>{item.status && <Text secondary numberOfLines={2}>{stripHtml(item.status.content)}</Text>}</View>{item.status ? <Icon name="chevron-forward-outline" size={20} /> : null}</Pressable>} />;
}
const styles = StyleSheet.create({ row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 68, padding: 15 }, avatar: { width: 42, height: 42, borderRadius: 21 }, body: { flex: 1, gap: 5 }, name: { fontWeight: "700" }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyNotificationsScreen.tsx */
