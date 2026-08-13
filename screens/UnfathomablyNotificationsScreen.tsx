/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyNotificationsScreen.tsx

    Purpose:

        Show notification activity from the Unfathomably backend.

    Responsibilities:

        - Paginate the stable per-event notification API
        - Describe group, emoji, event, poll, and ordinary social activity
        - Open the related status or actor profile
        - Accept or decline incoming account follow requests

    This file intentionally does NOT contain:

        - background notification polling
        - push-token registration
        - group or event moderation actions
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { stripHtml } from "../components/StatusCard";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useUnfathomablyStream from "../hooks/useUnfathomablyStream";
import * as Accounts from "../services/UnfathomablyAccountService";
import * as Unfathomably from "../services/UnfathomablyService";
import {
  getStreamedNotification,
  getStreamedStatus,
  UnfathomablyStreamingEvent,
} from "../services/UnfathomablyStreamingService";
import { getErrorMessage } from "../utils/error";

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
  const [pendingFollowRequestId, setPendingFollowRequestId] = useState<string>();
  const followRequestPendingRef = React.useRef(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      followRequestPendingRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!ctx?.login) return;
    setRefreshing(true);
    try {
      setError("");
      const next = await Unfathomably.getNotifications(ctx);
      if (isMountedRef.current) setItems(next);
    } catch (reason) {
      if (isMountedRef.current) {
        setError(reason instanceof Error ? reason.message : "Could not load notifications.");
      }
    } finally {
      if (isMountedRef.current) setRefreshing(false);
    }
  }, [ctx]);

  const loadMore = useCallback(async () => {
    const lastId = items.at(-1)?.id;
    if (!ctx?.login || !lastId || refreshing || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await Unfathomably.getNotifications(ctx, lastId);
      if (!isMountedRef.current) return;
      setItems(current => [
        ...current,
        ...next.filter(item => !current.some(existing => existing.id === item.id)),
      ]);
    } catch (reason) {
      if (isMountedRef.current) {
        setError(reason instanceof Error ? reason.message : "Could not load more notifications.");
      }
    } finally {
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [ctx, items, loadingMore, refreshing]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(interval);
  }, [refresh]));

  const handleStreamingEvent = useCallback((event: UnfathomablyStreamingEvent) => {
    const notification = getStreamedNotification(event);
    if (notification) {
      setItems(current => [
        notification,
        ...current.filter(item => item.id !== notification.id),
      ]);
      return;
    }

    const status = getStreamedStatus(event);
    if (status) {
      setItems(current => current.map(item =>
        item.status?.id === status.id ? { ...item, status } : item,
      ));
      return;
    }

    if (event.event === "delete" && typeof event.payload === "string") {
      setItems(current => current.map(item =>
        item.status?.id === event.payload
          ? { ...item, status: undefined }
          : item,
      ));
    }
  }, []);

  useUnfathomablyStream(
    ctx,
    { stream: "user:notification" },
    {
      onCatchUp: () => { void refresh(); },
      onEvent: handleStreamingEvent,
    },
  );

  const decideFollowRequest = useCallback(async (
    item: Unfathomably.UnfathomablyNotification,
    accept: boolean,
  ) => {
    if (!ctx?.login || followRequestPendingRef.current) return;

    followRequestPendingRef.current = true;
    setPendingFollowRequestId(item.account.id);
    try {
      await Accounts.resolveFollowRequest(ctx, item.account.id, accept);
      if (!isMountedRef.current) return;
      setItems(current => current.filter(notification => notification.id !== item.id));
    } catch (reason) {
      if (isMountedRef.current) {
        Alert.alert(
          accept ? "Could not accept follow request" : "Could not decline follow request",
          getErrorMessage(reason),
        );
      }
    } finally {
      followRequestPendingRef.current = false;
      if (isMountedRef.current) setPendingFollowRequestId(undefined);
    }
  }, [ctx]);

  if (!ctx?.login) return <SuggestLogin />;
  return (
    <FlatList
      testID="fediverse-notifications-list"
      data={items}
      keyExtractor={item => item.id}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.7}
      ListEmptyComponent={
        error ? (
          <RetryState message={error} onRetry={() => void refresh()} />
        ) : !refreshing ? (
          <Text style={styles.empty}>All caught up.</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View>
          <Pressable
            style={styles.row}
            accessibilityLabel={
              item.status
                ? `Open related post from ${item.account.display_name || item.account.acct}`
                : `Open profile for ${item.account.display_name || item.account.acct}`
            }
            accessibilityRole="button"
            onPress={() => {
              if (item.status) {
                navigation.navigate("Status", { statusId: item.status.id });
                return;
              }

              navigation.navigate("Account", {
                account: item.account,
                accountId: item.account.id,
              });
            }}
          >
            {!!item.account.avatar && (
              <Image source={{ uri: item.account.avatar }} style={styles.avatar} />
            )}
            <View style={styles.body}>
              <Text>
                <Text style={styles.name}>
                  {item.account.display_name || item.account.acct}
                </Text>{" "}
                {notificationLabel(item)}
              </Text>
              {item.status && (
                <Text secondary numberOfLines={2}>
                  {stripHtml(item.status.content)}
                </Text>
              )}
            </View>
            <Icon name="chevron-forward-outline" size={20} />
          </Pressable>
          {item.type === "follow_request" ? (
            <View style={styles.followRequestActions}>
              <AppButton
                title={pendingFollowRequestId === item.account.id ? "Saving..." : "Accept"}
                disabled={pendingFollowRequestId !== undefined}
                onPress={() => void decideFollowRequest(item, true)}
              />
              <AppButton
                title="Decline"
                disabled={pendingFollowRequestId !== undefined}
                onPress={() => void decideFollowRequest(item, false)}
              />
            </View>
          ) : null}
        </View>
      )}
    />
  );
}
const styles = StyleSheet.create({ row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 68, padding: 15 }, avatar: { width: 42, height: 42, borderRadius: 21 }, body: { flex: 1, gap: 5 }, name: { fontWeight: "700" }, followRequestActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", paddingBottom: 12, paddingHorizontal: 15 }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyNotificationsScreen.tsx */
