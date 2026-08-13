/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyFeedScreen.tsx

    Purpose:

        Show a live home or followed-groups timeline for the active account.

    Responsibilities:

        - Load and paginate the selected timeline
        - Apply live updates only while the list is at its newest edge
        - Pause the WebSocket while the reader is reviewing older posts

    This file intentionally does NOT contain:

        - WebSocket protocol handling
        - Status rendering internals
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
} from "react-native";

import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useUnfathomablyStream from "../hooks/useUnfathomablyStream";
import * as Unfathomably from "../services/UnfathomablyService";
import { applyStatusStreamingEvent } from "../services/UnfathomablyStreamingService";

/*
    Small platform scroll offsets can remain after pull-to-refresh settles.
    Treat the first 24 device-independent pixels as the newest edge so harmless
    bounce does not repeatedly close and reopen the live connection.
*/
const AUTOMATIC_UPDATE_TOP_THRESHOLD = 24;

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
  const [automaticUpdatesEnabled, setAutomaticUpdatesEnabled] = useState(true);
  const automaticUpdatesEnabledRef = useRef(true);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async (append = false) => {
    if (!ctx?.login || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
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
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [ctx, scope, statuses]);

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
    if (!automaticUpdatesEnabledRef.current) return;

    setStatuses(current => applyStatusStreamingEvent(
      current,
      event,
      status => scope !== "groups" || !!(status.group || status.reblog?.group),
    ));
  }, [scope]);

  const handleCatchUp = useCallback(() => {
    if (automaticUpdatesEnabledRef.current) void load();
  }, [load]);

  const handleScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const isAtTop = event.nativeEvent.contentOffset.y <=
      AUTOMATIC_UPDATE_TOP_THRESHOLD;
    if (isAtTop === automaticUpdatesEnabledRef.current) return;

    automaticUpdatesEnabledRef.current = isAtTop;
    setAutomaticUpdatesEnabled(isAtTop);

    /*
        Re-entering the newest edge performs an authoritative REST refresh.
        This closes the gap even when the socket was paused before its first
        connection completed or the server does not retain missed events.
    */
    if (isAtTop) void load();
  }, [load]);

  useUnfathomablyStream(
    ctx,
    { stream: scope === "groups" ? "user:groups" : "user" },
    {
      onCatchUp: handleCatchUp,
      onEvent: handleStreamingEvent,
    },
    automaticUpdatesEnabled,
  );

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <View style={styles.root}>
      {scope === "groups" && <Text secondary style={styles.groupLabel}>Posts from your followed groups</Text>}
      <FlatList
        data={statuses}
        keyExtractor={status => status.id}
        testID="timeline-list"
        renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />}
        refreshing={loading && statuses.length === 0}
        onRefresh={() => void load()}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onEndReached={() => void load(true)}
        onEndReachedThreshold={0.7}
        ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void load()} /> : loading ? null : <Text style={styles.empty}>Nothing here yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, groupLabel: { paddingHorizontal: 16, paddingTop: 10 }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyFeedScreen.tsx */
