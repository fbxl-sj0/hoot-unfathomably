/*
    Project: Hoot Unfathomably
    --------------------------

    File: SavedPostsScreen.tsx

    Purpose:

        Show posts bookmarked by the signed-in account.

    Responsibilities:

        - Load and paginate the standard Mastodon-compatible bookmark list
        - Render saved posts with the normal discussion and action controls
        - Refresh after bookmark state changes elsewhere in the app

    This file intentionally does NOT contain:

        - Server-side bookmark mutations
        - Offline post storage
        - Favourite-status history
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import RetryState from "../components/RetryState";
import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { getBookmarks } from "../services/UnfathomablyAccountService";
import type { UnfathomablyStatus } from "../services/UnfathomablyService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

export default function SavedPostsScreen({
  navigation,
}: RootStackScreenProps<"SavedPosts">) {
  const ctx = useLotideCtx();
  const [statuses, setStatuses] = useState<UnfathomablyStatus[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const isMountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!ctx?.login) return;

    setRefreshing(true);
    setError("");
    try {
      const next = await getBookmarks(ctx);
      if (!isMountedRef.current) return;
      setStatuses(next);
      setHasMore(next.length >= 30);
    } catch (reason) {
      if (isMountedRef.current) setError(getErrorMessage(reason));
    } finally {
      if (isMountedRef.current) {
        setLoaded(true);
        setRefreshing(false);
      }
    }
  }, [ctx]);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  async function loadMore() {
    const maxId = statuses.at(-1)?.id;
    if (!ctx?.login || !maxId || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const next = await getBookmarks(ctx, maxId);
      if (!isMountedRef.current) return;
      setStatuses(current => mergeStatuses(current, next));
      setHasMore(next.length >= 30);
    } catch (reason) {
      if (isMountedRef.current) setError(getErrorMessage(reason));
    } finally {
      if (isMountedRef.current) setLoadingMore(false);
    }
  }

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <FlatList
      data={statuses}
      keyExtractor={status => status.id}
      ListEmptyComponent={
        error ? (
          <RetryState message={error} onRetry={() => void refresh()} />
        ) : loaded ? (
          <Text style={styles.empty}>No saved posts yet.</Text>
        ) : null
      }
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.7}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      renderItem={({ item }) => (
        <StatusCard status={item} ctx={ctx} navigation={navigation} />
      )}
    />
  );
}

function mergeStatuses(
  current: UnfathomablyStatus[],
  incoming: UnfathomablyStatus[],
) {
  const seen = new Set(current.map(status => status.id));
  return [...current, ...incoming.filter(status => !seen.has(status.id))];
}

const styles = StyleSheet.create({
  empty: { padding: 30, textAlign: "center" },
});

/* end of SavedPostsScreen.tsx */
