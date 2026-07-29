/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyNotificationsScreen.tsx

    Purpose:

        Show notification activity from the Unfathomably backend.
*/

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { stripHtml } from "../components/StatusCard";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";

const labels: Record<string, string> = { favourite: "favourited your post", reblog: "boosted your post", mention: "mentioned you", follow: "followed you", poll: "updated a poll", group_follow: "followed a group" };
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
  return <FlatList data={items} keyExtractor={item => item.id} onRefresh={() => void refresh()} refreshing={refreshing} onEndReached={() => void loadMore()} onEndReachedThreshold={0.7} ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void refresh()} /> : !refreshing ? <Text style={styles.empty}>All caught up.</Text> : null} renderItem={({ item }) => <Pressable style={styles.row} accessibilityRole="button" onPress={() => item.status && navigation.navigate("Status", { statusId: item.status.id })}>{!!item.account.avatar && <Image source={{ uri: item.account.avatar }} style={styles.avatar} />}<View style={styles.body}><Text><Text style={styles.name}>{item.account.display_name || item.account.acct}</Text> {labels[item.type] || item.type}</Text>{item.status && <Text secondary numberOfLines={2}>{stripHtml(item.status.content)}</Text>}</View></Pressable>} />;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: 12, padding: 15 }, avatar: { width: 42, height: 42, borderRadius: 21 }, body: { flex: 1, gap: 5 }, name: { fontWeight: "700" }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyNotificationsScreen.tsx */
