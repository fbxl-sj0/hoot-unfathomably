/*
    Project: Hoot Unfathomably
    --------------------------

    File: AccountConnectionsScreen.tsx

    Purpose:

        Browse the followers or following list for one Fediverse account.

    Responsibilities:

        - Load and paginate a selected account connection list
        - Deduplicate cursor pages defensively
        - Open every result in the relationship-aware account screen

    This file intentionally does NOT contain:

        - Relationship mutations
        - Account search
        - Follow-request decisions
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import AccountRow from "../components/AccountRow";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Accounts from "../services/UnfathomablyAccountService";
import type { UnfathomablyAccount } from "../services/UnfathomablyService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

export default function AccountConnectionsScreen({
  navigation,
  route,
}: RootStackScreenProps<"AccountConnections">) {
  const ctx = useLotideCtx();
  const mode = route.params.mode === "followers" ? "followers" : "following";
  const [accounts, setAccounts] = useState<UnfathomablyAccount[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const isMountedRef = useRef(true);

  const requestPage = useCallback(
    (maxId?: string) => {
      if (!ctx?.login) return Promise.resolve([]);

      return mode === "followers"
        ? Accounts.getAccountFollowers(ctx, route.params.accountId, maxId)
        : Accounts.getAccountFollowing(ctx, route.params.accountId, maxId);
    },
    [ctx, mode, route.params.accountId],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const next = await requestPage();
      if (!isMountedRef.current) return;
      setAccounts(next);
      setHasMore(next.length >= 40);
    } catch (reason) {
      if (isMountedRef.current) setError(getErrorMessage(reason));
    } finally {
      if (isMountedRef.current) {
        setLoaded(true);
        setRefreshing(false);
      }
    }
  }, [requestPage]);

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
    const maxId = accounts.at(-1)?.id;
    if (!maxId || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const next = await requestPage(maxId);
      if (!isMountedRef.current) return;
      setAccounts(current => mergeAccounts(current, next));
      setHasMore(next.length >= 40);
    } catch (reason) {
      if (isMountedRef.current) setError(getErrorMessage(reason));
    } finally {
      if (isMountedRef.current) setLoadingMore(false);
    }
  }

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <FlatList
      data={accounts}
      keyExtractor={account => account.id}
      ListEmptyComponent={
        error ? (
          <RetryState message={error} onRetry={() => void refresh()} />
        ) : loaded ? (
          <Text style={styles.empty}>
            No {mode === "followers" ? "followers" : "followed accounts"} to show.
          </Text>
        ) : null
      }
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.7}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      renderItem={({ item }) => (
        <AccountRow
          account={item}
          onPress={() => navigation.push("Account", {
            account: item,
            accountId: item.id,
          })}
        />
      )}
    />
  );
}

function mergeAccounts(
  current: UnfathomablyAccount[],
  incoming: UnfathomablyAccount[],
) {
  const seen = new Set(current.map(account => account.id));
  return [...current, ...incoming.filter(account => !seen.has(account.id))];
}

const styles = StyleSheet.create({
  empty: { padding: 30, textAlign: "center" },
});

/* end of AccountConnectionsScreen.tsx */
