/*
    Project: Hoot Mobile
    --------------------------

    File: StatusThreadScreen.tsx

    Purpose:

        Show a status and its Mastodon-compatible reply conversation.
*/

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";
import Icon from "@expo/vector-icons/Ionicons";

import StatusCard from "../components/StatusCard";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";

export default function StatusThreadScreen({ navigation, route }: { navigation: any; route: { params: { statusId: string } } }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [status, setStatus] = useState<Unfathomably.UnfathomablyStatus>();
  const [replies, setReplies] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [ancestors, setAncestors] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!ctx?.login) return;
    try {
      setError("");
      const [post, context] = await Promise.all([Unfathomably.getStatus(ctx, route.params.statusId), Unfathomably.getStatusContext(ctx, route.params.statusId)]);
      setStatus(post); setAncestors(context.ancestors); setReplies(context.descendants);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load this conversation."); }
  }, [ctx, route.params.statusId]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!ctx?.login) return null;
  if (!status) return <View style={styles.root}>{error ? <RetryState message={error} onRetry={() => void load()} /> : null}</View>;
  return <FlatList
    style={styles.root}
    data={replies}
    keyExtractor={item => item.id}
    renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />}
    onRefresh={() => void load()}
    refreshing={false}
    ListHeaderComponent={<><View style={[styles.reply, { borderColor: theme.secondaryBackground }]}><Pressable accessibilityRole="button" onPress={() => navigation.navigate("NewPostScreen", { inReplyToId: status.id })}><Text style={{ color: theme.tint }}><Icon name="arrow-undo-outline" size={19} /> Reply</Text></Pressable></View>{ancestors.map(item => <StatusCard key={item.id} status={item} ctx={ctx} navigation={navigation} compact />)}<StatusCard status={status} ctx={ctx} navigation={navigation} /></>}
    ListEmptyComponent={<Text style={styles.empty}>No replies yet.</Text>}
  />;
}

const styles = StyleSheet.create({ root: { flex: 1 }, reply: { padding: 15, borderBottomWidth: 1 }, empty: { padding: 28, textAlign: "center" } });

/* end of StatusThreadScreen.tsx */
