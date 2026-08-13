/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyFeedScreen.tsx

    Purpose:

        Show the signed-in account's standard Unfathomably home timeline.
*/

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useUnfathomablyStream from "../hooks/useUnfathomablyStream";
import * as Unfathomably from "../services/UnfathomablyService";
import { applyStatusStreamingEvent } from "../services/UnfathomablyStreamingService";

export default function UnfathomablyFeedScreen({
  navigation,
  scope = "home",
}: {
  navigation: any;
  scope?: "home" | "groups";
}) {
  const ctx = useLotideCtx();
  const [statuses, setStatuses] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (append = false) => {
    if (!ctx?.login || loading) return;
    setLoading(true);
    setError("");
    try {
      const next = scope === "groups"
        ? await Unfathomably.getGroupTimeline(ctx, append ? statuses.at(-1)?.id : undefined)
        : await Unfathomably.getHomeTimeline(ctx, append ? statuses.at(-1)?.id : undefined);
      setStatuses(existing => append ? [...existing, ...next.filter(item => !existing.some(old => old.id === item.id))] : next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this feed.");
    } finally {
      setLoading(false);
    }
  }, [ctx, loading, scope, statuses]);

  useEffect(() => {
    if (!ctx?.login) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      (scope === "groups" ? Unfathomably.getGroupTimeline(ctx) : Unfathomably.getHomeTimeline(ctx))
        .then(next => {
          if (active) setStatuses(next);
        })
        .catch(reason => {
          if (active) setError(reason instanceof Error ? reason.message : "Could not load this feed.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ctx, scope]);

  const handleStreamingEvent = useCallback((event: Parameters<typeof applyStatusStreamingEvent>[1]) => {
    setStatuses(current => applyStatusStreamingEvent(
      current,
      event,
      status => scope !== "groups" || !!(status.group || status.reblog?.group),
    ));
  }, [scope]);

  useUnfathomablyStream(
    ctx,
    { stream: scope === "groups" ? "user:groups" : "user" },
    {
      onCatchUp: () => { void load(); },
      onEvent: handleStreamingEvent,
    },
  );

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <View style={styles.root}>
      {scope === "groups" && <Text secondary style={styles.groupLabel}>Posts from your followed groups</Text>}
      <FlatList
        data={statuses}
        keyExtractor={status => status.id}
        renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />}
        refreshing={loading && statuses.length === 0}
        onRefresh={() => void load()}
        onEndReached={() => void load(true)}
        onEndReachedThreshold={0.7}
        ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void load()} /> : loading ? null : <Text style={styles.empty}>Nothing here yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, groupLabel: { paddingHorizontal: 16, paddingTop: 10 }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyFeedScreen.tsx */
