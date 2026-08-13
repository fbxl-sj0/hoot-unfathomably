/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablySourceScreen.tsx

    Purpose:

        Preview one federated feed or source through the local server.

    Responsibilities:

        - Load source identity, relationship, and normalized preview items
        - Render local statuses with the standard status controls
        - Render non-status entries without executing remote content
        - Apply explicit follow and unfollow actions

    This file intentionally does NOT contain:

        - direct provider access
        - feed parsing
        - source search or discovery
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet } from "react-native";

import RetryState from "../components/RetryState";
import SourceItemCard from "../components/SourceItemCard";
import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useUnfathomablyStream from "../hooks/useUnfathomablyStream";
import type { UnfathomablyStreamingEvent } from "../services/UnfathomablyStreamingService";
import {
  getSource,
  getSourceItems,
  setSourceFollowed,
  UnfathomablySource,
  UnfathomablySourceItem,
} from "../services/UnfathomablySourcesService";
import { getErrorMessage } from "../utils/error";
import { openExternalLink } from "../utils/externalLink";

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function UnfathomablySourceScreen({ navigation, route }: { navigation: any; route: { params: { sourceId: string; title?: string } } }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [source, setSource] = useState<UnfathomablySource>();
  const [items, setItems] = useState<UnfathomablySourceItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const id = route.params.sourceId;

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setLoading(true);
    setError("");
    try {
      const [nextSource, page] = await Promise.all([
        getSource(ctx, id),
        getSourceItems(ctx, id),
      ]);
      setSource(nextSource);
      setItems(page.items);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [ctx, id]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleStreamingEvent = useCallback((event: UnfathomablyStreamingEvent) => {
    if (["delete", "status.update", "update"].includes(event.event)) {
      void load();
    }
  }, [load]);

  useUnfathomablyStream(
    ctx,
    { stream: "source", source: id },
    {
      onCatchUp: () => { void load(); },
      onEvent: handleStreamingEvent,
    },
  );

  if (!ctx?.login) return <SuggestLogin />;

  async function toggleFollow() {
    if (!source || saving) return;
    setSaving(true);
    try {
      const relationship = await setSourceFollowed(
        ctx as LotideContext,
        source.id,
        source.relationship?.following !== true,
      );
      setSource(existing => existing ? { ...existing, relationship } : existing);
    } catch (reason) {
      Alert.alert("Could not update this feed", getErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <View style={[styles.header, { borderColor: theme.tertiaryBackground }]}>
      {source?.header ? <Image source={{ uri: source.header }} style={styles.cover} /> : null}
      <View style={styles.headerBody}>
        <View style={styles.identity}>
          {source?.avatar ? <Image source={{ uri: source.avatar }} style={styles.avatar} /> : null}
          <View style={styles.identityText}>
            <Text style={styles.title}>{source?.display_name || route.params.title || "Feed"}</Text>
            {source ? <Text secondary>{source.platform_label} · {source.source_kind_label}</Text> : null}
          </View>
        </View>
        {source?.note ? <Text style={styles.note}>{plainText(source.note)}</Text> : null}
        <View style={styles.actions}>
          {source ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={source.relationship?.following ? "Unfollow this feed" : "Follow this feed"}
              disabled={saving}
              onPress={() => { void toggleFollow(); }}
              style={[styles.primary, { backgroundColor: theme.tint }]}
            >
              <Icon name={source.relationship?.following ? "checkmark-outline" : "add-outline"} color={theme.background} size={20} />
              <Text style={{ color: theme.background }}>
                {saving ? "Saving..." : source.relationship?.following ? "Following" : "Follow"}
              </Text>
            </Pressable>
          ) : null}
          {source?.url ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open original feed"
              onPress={() => { void openExternalLink(source.url); }}
              style={styles.original}
            >
              <Icon name="open-outline" color={theme.tint} size={20} />
              <Text tint>Original</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={error
          ? <RetryState message={error} onRetry={() => { void load(); }} />
          : loading ? null : <Text style={styles.empty}>This feed has no preview items.</Text>}
        onRefresh={() => { void load(); }}
        refreshing={loading}
        renderItem={({ item }) => item.status
          ? <StatusCard status={item.status} ctx={ctx} navigation={navigation} />
          : <SourceItemCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 8 },
  cover: { height: 130, width: "100%" },
  headerBody: { gap: 10, padding: 15 },
  identity: { alignItems: "center", flexDirection: "row", gap: 11 },
  avatar: { borderRadius: 30, height: 60, width: 60 },
  identityText: { flex: 1, gap: 3 },
  title: { fontSize: 23, fontWeight: "700" },
  note: { fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 13 },
  primary: { alignItems: "center", borderRadius: 9, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, minWidth: 126, paddingHorizontal: 16 },
  original: { alignItems: "center", flexDirection: "row", gap: 7, minHeight: 48, paddingHorizontal: 7 },
  empty: { padding: 30, textAlign: "center" },
});

/* end of UnfathomablySourceScreen.tsx */
