/*
    Project: Hoot Unfathomably
    --------------------------

    File: AccountScreen.tsx

    Purpose:

        Show any Fediverse account and its relationship to the signed-in user.

    Responsibilities:

        - Load account details, relationship state, and account posts
        - Follow or cancel a pending follow request and unfollow
        - Mute or block an account with explicit confirmation
        - Open follower and following lists

    This file intentionally does NOT contain:

        - Account search
        - Incoming follow-request decisions
        - Signed-in account logout
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import RetryState from "../components/RetryState";
import StatusCard, { stripHtml } from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Accounts from "../services/UnfathomablyAccountService";
import * as Unfathomably from "../services/UnfathomablyService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

type AccountLoadState = {
  account?: Unfathomably.UnfathomablyAccount;
  relationship?: Unfathomably.UnfathomablyAccountRelationship;
  statuses: Unfathomably.UnfathomablyStatus[];
};

type RelationshipAction = "block" | "follow" | "mute";

export default function AccountScreen({
  navigation,
  route,
}: RootStackScreenProps<"Account">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const accountId = route.params.accountId;
  const initialAccount = route.params.account;
  const ownAccountId = String(ctx?.login?.user?.id ?? "");
  const isOwnAccount = ownAccountId === accountId;
  const [state, setState] = useState<AccountLoadState>({
    account: initialAccount,
    statuses: [],
  });
  const [error, setError] = useState("");
  const [relationshipError, setRelationshipError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreStatuses, setHasMoreStatuses] = useState(true);
  const [pendingAction, setPendingAction] = useState<RelationshipAction>();
  const actionPendingRef = useRef(false);
  const isMountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!ctx?.login || !accountId) return;

    setError("");
    setRelationshipError("");
    const accountRequest = Accounts.getAccount(ctx, accountId);
    const relationshipRequest = isOwnAccount
      ? Promise.resolve(undefined)
      : Accounts.getAccountRelationship(ctx, accountId);
    const statusesRequest = Unfathomably.getAccountStatuses(ctx, accountId);
    const [accountResult, relationshipResult, statusesResult] =
      await Promise.allSettled([
        accountRequest,
        relationshipRequest,
        statusesRequest,
      ]);

    if (!isMountedRef.current) return;

    if (accountResult.status === "rejected") {
      setError(getErrorMessage(accountResult.reason));
    }
    if (relationshipResult.status === "rejected") {
      setRelationshipError(getErrorMessage(relationshipResult.reason));
    }
    if (statusesResult.status === "rejected" && accountResult.status !== "rejected") {
      setError(`Could not load posts. ${getErrorMessage(statusesResult.reason)}`);
    }

    setState(current => ({
      account:
        accountResult.status === "fulfilled"
          ? accountResult.value
          : current.account,
      relationship:
        relationshipResult.status === "fulfilled"
          ? relationshipResult.value
          : current.relationship,
      statuses:
        statusesResult.status === "fulfilled"
          ? statusesResult.value
          : current.statuses,
    }));
    if (statusesResult.status === "fulfilled") {
      setHasMoreStatuses(statusesResult.value.length >= 30);
    }
  }, [accountId, ctx, isOwnAccount]);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;
    const timer = setTimeout(() => {
      void load().finally(() => {
        if (active) setLoading(false);
      });
    }, 0);

    return () => {
      active = false;
      isMountedRef.current = false;
      actionPendingRef.current = false;
      clearTimeout(timer);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (isMountedRef.current) setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    const maxId = state.statuses.at(-1)?.id;
    if (!ctx?.login || !maxId || loadingMore || !hasMoreStatuses) return;

    setLoadingMore(true);
    try {
      const next = await Unfathomably.getAccountStatuses(ctx, accountId, maxId);
      if (!isMountedRef.current) return;
      setState(current => ({
        ...current,
        statuses: mergeStatuses(current.statuses, next),
      }));
      setHasMoreStatuses(next.length >= 30);
    } catch (reason) {
      if (isMountedRef.current) {
        setError(`Could not load more posts. ${getErrorMessage(reason)}`);
      }
    } finally {
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [accountId, ctx, hasMoreStatuses, loadingMore, state.statuses]);

  async function runRelationshipAction(
    action: RelationshipAction,
    operation: () => Promise<Unfathomably.UnfathomablyAccountRelationship>,
  ) {
    if (actionPendingRef.current) return;

    actionPendingRef.current = true;
    setPendingAction(action);
    try {
      const relationship = await operation();
      if (!isMountedRef.current) return;
      setState(current => ({ ...current, relationship }));
      setRelationshipError("");
    } catch (reason) {
      if (isMountedRef.current) {
        Alert.alert("Could not update relationship", getErrorMessage(reason));
      }
    } finally {
      actionPendingRef.current = false;
      if (isMountedRef.current) setPendingAction(undefined);
    }
  }

  function toggleFollow() {
    if (!ctx?.login || !state.relationship) return;
    const currentlyFollowed =
      state.relationship.following || state.relationship.requested;
    void runRelationshipAction("follow", () =>
      Accounts.setAccountFollowed(ctx, accountId, !currentlyFollowed),
    );
  }

  function confirmMute() {
    if (!ctx?.login || !state.relationship) return;
    const nextMuted = !state.relationship.muting;

    Alert.alert(
      nextMuted ? "Mute this account?" : "Unmute this account?",
      nextMuted
        ? "Their posts and notifications will be hidden by your server."
        : "Their posts and notifications can appear again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextMuted ? "Mute" : "Unmute",
          style: nextMuted ? "destructive" : "default",
          onPress: () => {
            void runRelationshipAction("mute", () =>
              Accounts.setAccountMuted(ctx, accountId, nextMuted),
            );
          },
        },
      ],
    );
  }

  function confirmBlock() {
    if (!ctx?.login || !state.relationship) return;
    const nextBlocked = !state.relationship.blocking;

    Alert.alert(
      nextBlocked ? "Block this account?" : "Unblock this account?",
      nextBlocked
        ? "Your server will sever the relationship and hide this account."
        : "This removes the block but does not automatically follow them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextBlocked ? "Block" : "Unblock",
          style: nextBlocked ? "destructive" : "default",
          onPress: () => {
            void runRelationshipAction("block", () =>
              Accounts.setAccountBlocked(ctx, accountId, nextBlocked),
            );
          },
        },
      ],
    );
  }

  if (!ctx?.login) return <SuggestLogin />;

  if (!state.account && loading) {
    return <Text style={styles.empty}>Loading profile...</Text>;
  }

  if (!state.account) {
    return <RetryState message={error || "Could not load profile."} onRetry={() => void refresh()} />;
  }

  const account = state.account;
  const relationship = state.relationship;
  const followTitle = relationship?.following
    ? "Following"
    : relationship?.requested
      ? "Requested"
      : "Follow";

  return (
    <FlatList
      data={state.statuses}
      keyExtractor={status => status.id}
      ListHeaderComponent={
        <View style={styles.header}>
          {account.header ? (
            <Image source={{ uri: account.header }} style={styles.banner} />
          ) : null}
          <View style={styles.identity}>
            {account.avatar ? (
              <Image source={{ uri: account.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.secondaryBackground }]}>
                <Icon name="person-outline" size={35} color={theme.secondaryText} />
              </View>
            )}
            <View style={styles.identityText}>
              <Text style={styles.name}>{account.display_name || account.username}</Text>
              <Text secondary>@{account.acct}</Text>
              {account.locked ? <Text secondary>Follow approval required</Text> : null}
            </View>
          </View>
          {account.note ? (
            <Text style={styles.description}>{stripHtml(account.note)}</Text>
          ) : null}
          <View style={styles.counts}>
            <Pressable
              accessibilityLabel={`Open followers for ${account.display_name || account.username}`}
              accessibilityRole="button"
              onPress={() => navigation.navigate("AccountConnections", {
                accountId,
                mode: "followers",
                title: account.display_name || account.username,
              })}
              style={styles.count}
            >
              <Text style={styles.countValue}>{account.followers_count ?? "Hidden"}</Text>
              <Text secondary>Followers</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`Open accounts followed by ${account.display_name || account.username}`}
              accessibilityRole="button"
              onPress={() => navigation.navigate("AccountConnections", {
                accountId,
                mode: "following",
                title: account.display_name || account.username,
              })}
              style={styles.count}
            >
              <Text style={styles.countValue}>{account.following_count ?? "Hidden"}</Text>
              <Text secondary>Following</Text>
            </Pressable>
            <View style={styles.count}>
              <Text style={styles.countValue}>{account.statuses_count ?? state.statuses.length}</Text>
              <Text secondary>Posts</Text>
            </View>
          </View>
          {!isOwnAccount ? (
            relationship ? (
              <View style={styles.actions}>
                <AppButton
                  title={pendingAction === "follow" ? "Saving..." : followTitle}
                  accessibilityLabel={
                    relationship.following || relationship.requested
                      ? `Unfollow ${account.display_name || account.username}`
                      : `Follow ${account.display_name || account.username}`
                  }
                  disabled={pendingAction !== undefined || relationship.blocking}
                  onPress={toggleFollow}
                  style={styles.action}
                />
                <AppButton
                  title={pendingAction === "mute" ? "Saving..." : relationship.muting ? "Unmute" : "Mute"}
                  disabled={pendingAction !== undefined}
                  onPress={confirmMute}
                  color={theme.secondaryBackground}
                  textColor={theme.text}
                  style={styles.action}
                />
                <AppButton
                  title={pendingAction === "block" ? "Saving..." : relationship.blocking ? "Unblock" : "Block"}
                  disabled={pendingAction !== undefined}
                  onPress={confirmBlock}
                  color={relationship.blocking ? theme.secondaryBackground : theme.red}
                  textColor={relationship.blocking ? theme.text : "#ffffff"}
                  style={styles.action}
                />
              </View>
            ) : (
              <RetryState
                compact
                message={relationshipError
                  ? `Relationship controls unavailable. ${relationshipError}`
                  : "Relationship controls unavailable."}
                onRetry={() => void refresh()}
              />
            )
          ) : null}
          {error ? (
            <RetryState compact message={error} onRetry={() => void refresh()} />
          ) : null}
          <Text style={styles.postsTitle}>Posts</Text>
        </View>
      }
      ListEmptyComponent={
        !loading && !error ? <Text style={styles.empty}>No posts to show.</Text> : null
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
  current: Unfathomably.UnfathomablyStatus[],
  incoming: Unfathomably.UnfathomablyStatus[],
) {
  const seen = new Set(current.map(status => status.id));
  return [...current, ...incoming.filter(status => !seen.has(status.id))];
}

const styles = StyleSheet.create({
  header: { gap: 13, paddingBottom: 8 },
  banner: { height: 130, width: "100%" },
  identity: { alignItems: "center", flexDirection: "row", gap: 13, paddingHorizontal: 15 },
  identityText: { flex: 1, gap: 2 },
  avatar: { borderRadius: 38, height: 76, width: 76 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 21, fontWeight: "700" },
  description: { paddingHorizontal: 15 },
  counts: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 10 },
  count: { alignItems: "center", justifyContent: "center", minHeight: 52, minWidth: 82 },
  countValue: { fontSize: 17, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 15 },
  action: { flexGrow: 1, minWidth: 94 },
  postsTitle: { fontSize: 18, fontWeight: "700", paddingHorizontal: 15, paddingTop: 6 },
  empty: { padding: 30, textAlign: "center" },
});

/* end of AccountScreen.tsx */
