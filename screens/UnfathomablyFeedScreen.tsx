/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyFeedScreen.tsx

    Purpose:

        Show a live home or followed-groups timeline for the active account.

    Responsibilities:

        - Restore and update the selected account's bounded offline snapshot
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
import { offlineTimelines } from "../services/OfflineCacheService";
import {
  FediverseFilter,
  getFilters,
  matchLegacyFilters,
} from "../services/UnfathomablyFiltersService";
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
  const [offlineStoredAt, setOfflineStoredAt] = useState<number>();
  const [automaticUpdatesEnabled, setAutomaticUpdatesEnabled] = useState(true);
  const automaticUpdatesEnabledRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const statusesRef = useRef<Unfathomably.UnfathomablyStatus[]>([]);
  const legacyFiltersRef = useRef<FediverseFilter[]>([]);

  const applyLegacyFilters = useCallback((
    source: Unfathomably.UnfathomablyStatus[],
  ) => source.map(status => {
    const serverMatches = (status.filtered || []).filter(
      match => !match.filter.id.startsWith("legacy:"),
    );
    const legacyMatches = matchLegacyFilters(
      status,
      legacyFiltersRef.current,
      "home",
    ).map(filter => ({
      filter: {
        context: filter.contexts,
        filter_action: filter.action,
        id: `legacy:${filter.id}`,
        title: filter.title,
      },
      keyword_matches: filter.keywords.map(keyword => keyword.keyword),
      status_matches: [],
    }));
    const filtered = [...serverMatches, ...legacyMatches];
    return {
      ...status,
      filtered: filtered.length > 0 ? filtered : null,
    };
  }), []);

  const commitStatuses = useCallback((
    next: Unfathomably.UnfathomablyStatus[],
    cache = true,
  ) => {
    const filtered = applyLegacyFilters(next);
    statusesRef.current = filtered;
    setStatuses(filtered);
    if (cache && ctx?.login) {
      void offlineTimelines.store(ctx, scope, filtered).catch(() => undefined);
    }
  }, [applyLegacyFilters, ctx, scope]);

  useEffect(() => {
    if (!ctx?.login) return;
    let active = true;
    void getFilters(ctx)
      .then(filters => {
        if (!active) return;
        legacyFiltersRef.current = filters.filter(filter => filter.apiVersion === 1);
        commitStatuses(statusesRef.current, false);
      })
      .catch(() => {
        if (!active) return;
        legacyFiltersRef.current = [];
        commitStatuses(statusesRef.current, false);
      });
    return () => { active = false; };
  }, [commitStatuses, ctx]);

  const load = useCallback(async (append = false) => {
    if (!ctx?.login || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const next = scope === "groups"
        ? await Unfathomably.getGroupTimeline(ctx, append ? statusesRef.current.at(-1)?.id : undefined)
        : await Unfathomably.getHomeTimeline(ctx, append ? statusesRef.current.at(-1)?.id : undefined);
      const existing = statusesRef.current;
      const combined = append
        ? [...existing, ...next.filter(item => !existing.some(old => old.id === item.id))]
        : next;
      commitStatuses(combined);
      setOfflineStoredAt(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this feed.");
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [commitStatuses, ctx, scope]);

  useEffect(() => {
    if (!ctx?.login) return;
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        statusesRef.current = [];
        setStatuses([]);
        setOfflineStoredAt(undefined);
        setLoading(true);
        setError("");

        try {
          const cached = await offlineTimelines.query(ctx, scope);
          if (active && cached) {
            commitStatuses(cached.items, false);
            setOfflineStoredAt(cached.storedAt);
          }
        } catch {
          // A cache read must never prevent the authoritative network refresh.
        }

        try {
          const next = scope === "groups"
            ? await Unfathomably.getGroupTimeline(ctx)
            : await Unfathomably.getHomeTimeline(ctx);
          if (active) {
            commitStatuses(next);
            setOfflineStoredAt(undefined);
          }
        } catch (reason) {
          if (active) {
            setError(reason instanceof Error ? reason.message : "Could not load this feed.");
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [commitStatuses, ctx, scope]);

  const handleStreamingEvent = useCallback((event: Parameters<typeof applyStatusStreamingEvent>[1]) => {
    if (!automaticUpdatesEnabledRef.current) return;

    const next = applyStatusStreamingEvent(
      statusesRef.current,
      event,
      status => scope !== "groups" || !!(status.group || status.reblog?.group),
    );
    commitStatuses(next);
    setOfflineStoredAt(undefined);
  }, [commitStatuses, scope]);

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
      {offlineStoredAt !== undefined ? (
        <View accessibilityRole="summary" style={styles.offlineNotice}>
          <Text secondary>
            Offline copy saved {new Date(offlineStoredAt).toLocaleString()}
          </Text>
          {error ? <Text secondary numberOfLines={2}>{error}</Text> : null}
        </View>
      ) : null}
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

const styles = StyleSheet.create({ root: { flex: 1 }, groupLabel: { paddingHorizontal: 16, paddingTop: 10 }, offlineNotice: { gap: 2, paddingHorizontal: 16, paddingVertical: 8 }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyFeedScreen.tsx */
