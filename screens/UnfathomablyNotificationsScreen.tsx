/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyNotificationsScreen.tsx

    Purpose:

        Show notification activity from the Unfathomably backend.

    Responsibilities:

        - Paginate the stable per-event notification API
        - Restore a bounded account-specific snapshot when offline
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
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import AppButton from "../components/AppButton";
import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { stripHtml } from "../components/StatusCard";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useUnfathomablyStream from "../hooks/useUnfathomablyStream";
import { offlineNotifications } from "../services/OfflineCacheService";
import {
  notificationCategory,
  NotificationCategory,
} from "../services/NotificationPoller";
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

const notificationFilters: {
  label: string;
  value: "all" | NotificationCategory;
}[] = [
  { label: "All", value: "all" },
  { label: "Mentions", value: "mentions" },
  { label: "Reactions", value: "reactions" },
  { label: "Follows", value: "follows" },
  { label: "Groups", value: "groups" },
  { label: "Events", value: "events" },
  { label: "Polls", value: "polls" },
  { label: "Updates", value: "updates" },
  { label: "Other", value: "other" },
];

type NotificationGroupSummary = {
  count: number;
  groupKey: string;
};

function notificationsFromGroups(
  response: Unfathomably.UnfathomablyGroupedNotifications,
): {
  items: Unfathomably.UnfathomablyNotification[];
  nextCursor?: string;
  summaries: Record<string, NotificationGroupSummary>;
} {
  const accounts = new Map(
    response.accounts.map(account => [account.id, account]),
  );
  const statuses = new Map(
    response.statuses.map(status => [status.id, status]),
  );
  const items: Unfathomably.UnfathomablyNotification[] = [];
  const summaries: Record<string, NotificationGroupSummary> = {};

  response.notification_groups.forEach(group => {
    const account =
      group.sample_account_ids
        .map(id => accounts.get(id))
        .find(
          (item): item is Unfathomably.UnfathomablyAccount =>
            item !== undefined,
        ) ||
      (group.status_id ? statuses.get(group.status_id)?.account : undefined);
    if (!account) return;
    const id = group.most_recent_notification_id;
    items.push({
      account,
      created_at: group.latest_page_notification_at || new Date().toISOString(),
      id,
      status: group.status_id ? statuses.get(group.status_id) : undefined,
      type: group.type,
    });
    summaries[id] = {
      count: Math.max(1, group.notifications_count),
      groupKey: group.group_key,
    };
  });

  const cursors = response.notification_groups
    .map(group => group.page_min_id)
    .filter((value): value is string => !!value);
  return { items, nextCursor: cursors.at(-1), summaries };
}

function notificationLabel(
  item: Unfathomably.UnfathomablyNotification,
): string {
  const base = labels[item.type] || item.type.replace(/[_:-]+/g, " ");
  const target = item.target?.display_name || item.target?.acct;
  const targetSuffix =
    target &&
    ["group_follow", "group_follow_request", "move"].includes(item.type)
      ? ` ${target}`
      : "";
  const emoji =
    item.type === "pleroma:emoji_reaction" && item.emoji
      ? ` ${item.emoji}`
      : "";
  return `${base}${targetSuffix}${emoji}`;
}
export default function UnfathomablyNotificationsScreen({
  navigation,
}: {
  navigation: any;
}) {
  const ctx = useLotideCtx();
  const [items, setItems] = useState<Unfathomably.UnfathomablyNotification[]>(
    [],
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offlineStoredAt, setOfflineStoredAt] = useState<number>();
  const [pendingFollowRequestId, setPendingFollowRequestId] =
    useState<string>();
  const [pendingDismissalKey, setPendingDismissalKey] = useState<string>();
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | NotificationCategory
  >("all");
  const [groupSummaries, setGroupSummaries] = useState<
    Record<string, NotificationGroupSummary>
  >({});
  const groupedCursorRef = React.useRef<string | undefined>(undefined);
  const groupedModeRef = React.useRef(false);
  const followRequestPendingRef = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const itemsRef = React.useRef<Unfathomably.UnfathomablyNotification[]>([]);

  const commitItems = useCallback(
    (next: Unfathomably.UnfathomablyNotification[], cache = true) => {
      itemsRef.current = next;
      setItems(next);
      if (cache && ctx?.login) {
        void offlineNotifications.store(ctx, next).catch(() => undefined);
      }
    },
    [ctx],
  );

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      followRequestPendingRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (hydrateCache = false) => {
      if (!ctx?.login) return;
      setRefreshing(true);
      try {
        setError("");

        if (hydrateCache && itemsRef.current.length === 0) {
          try {
            const cached = await offlineNotifications.query(ctx);
            if (isMountedRef.current && cached) {
              commitItems(cached.items, false);
              setOfflineStoredAt(cached.storedAt);
            }
          } catch {
            // Network refresh remains authoritative when local data is corrupt.
          }
        }

        const grouped =
          typeof Unfathomably.getGroupedNotifications === "function"
            ? await Unfathomably.getGroupedNotifications(ctx)
            : undefined;
        const normalized = grouped
          ? notificationsFromGroups(grouped)
          : undefined;
        const next =
          normalized?.items || (await Unfathomably.getNotifications(ctx));
        if (isMountedRef.current) {
          groupedModeRef.current = normalized !== undefined;
          groupedCursorRef.current = normalized?.nextCursor;
          setGroupSummaries(normalized?.summaries || {});
          commitItems(next);
          setOfflineStoredAt(undefined);
        }
      } catch (reason) {
        if (isMountedRef.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load notifications.",
          );
        }
      } finally {
        if (isMountedRef.current) setRefreshing(false);
      }
    },
    [commitItems, ctx],
  );

  const loadMore = useCallback(async () => {
    const lastId = groupedModeRef.current
      ? groupedCursorRef.current
      : items.at(-1)?.id;
    if (!ctx?.login || !lastId || refreshing || loadingMore) return;
    setLoadingMore(true);
    try {
      const grouped =
        groupedModeRef.current &&
        typeof Unfathomably.getGroupedNotifications === "function"
          ? await Unfathomably.getGroupedNotifications(ctx, lastId)
          : undefined;
      const normalized = grouped ? notificationsFromGroups(grouped) : undefined;
      const next =
        normalized?.items || (await Unfathomably.getNotifications(ctx, lastId));
      if (!isMountedRef.current) return;
      const current = itemsRef.current;
      if (normalized) {
        groupedCursorRef.current = normalized.nextCursor;
        setGroupSummaries(existing => ({
          ...existing,
          ...normalized.summaries,
        }));
      }
      commitItems([
        ...current,
        ...next.filter(
          item => !current.some(existing => existing.id === item.id),
        ),
      ]);
    } catch (reason) {
      if (isMountedRef.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load more notifications.",
        );
      }
    } finally {
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [commitItems, ctx, items, loadingMore, refreshing]);

  useFocusEffect(
    useCallback(() => {
      itemsRef.current = [];
      setItems([]);
      setOfflineStoredAt(undefined);
      groupedCursorRef.current = undefined;
      groupedModeRef.current = false;
      setGroupSummaries({});
      void refresh(true);
      const interval = setInterval(() => {
        void refresh();
      }, 60_000);
      return () => clearInterval(interval);
    }, [refresh]),
  );

  const handleStreamingEvent = useCallback(
    (event: UnfathomablyStreamingEvent) => {
      const notification = getStreamedNotification(event);
      if (notification) {
        const current = itemsRef.current;
        commitItems([
          notification,
          ...current.filter(item => item.id !== notification.id),
        ]);
        setOfflineStoredAt(undefined);
        return;
      }

      const status = getStreamedStatus(event);
      if (status) {
        commitItems(
          itemsRef.current.map(item =>
            item.status?.id === status.id ? { ...item, status } : item,
          ),
        );
        return;
      }

      if (event.event === "delete" && typeof event.payload === "string") {
        commitItems(
          itemsRef.current.map(item =>
            item.status?.id === event.payload
              ? { ...item, status: undefined }
              : item,
          ),
        );
      }
    },
    [commitItems],
  );

  useUnfathomablyStream(
    ctx,
    { stream: "user:notification" },
    {
      onCatchUp: () => {
        void refresh();
      },
      onEvent: handleStreamingEvent,
    },
  );

  const decideFollowRequest = useCallback(
    async (item: Unfathomably.UnfathomablyNotification, accept: boolean) => {
      if (!ctx?.login || followRequestPendingRef.current) return;

      followRequestPendingRef.current = true;
      setPendingFollowRequestId(item.account.id);
      try {
        await Accounts.resolveFollowRequest(ctx, item.account.id, accept);
        if (!isMountedRef.current) return;
        commitItems(
          itemsRef.current.filter(notification => notification.id !== item.id),
        );
      } catch (reason) {
        if (isMountedRef.current) {
          Alert.alert(
            accept
              ? "Could not accept follow request"
              : "Could not decline follow request",
            getErrorMessage(reason),
          );
        }
      } finally {
        followRequestPendingRef.current = false;
        if (isMountedRef.current) setPendingFollowRequestId(undefined);
      }
    },
    [commitItems, ctx],
  );

  const dismissGroup = useCallback(
    async (item: Unfathomably.UnfathomablyNotification) => {
      const summary = groupSummaries[item.id];
      if (!ctx?.login || !summary || pendingDismissalKey) return;

      setPendingDismissalKey(summary.groupKey);
      try {
        await Unfathomably.dismissGroupedNotification(ctx, summary.groupKey);
        if (!isMountedRef.current) return;
        commitItems(
          itemsRef.current.filter(notification => notification.id !== item.id),
        );
        setGroupSummaries(current => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      } catch (reason) {
        if (isMountedRef.current) {
          Alert.alert(
            "Could not dismiss notification",
            getErrorMessage(reason),
          );
        }
      } finally {
        if (isMountedRef.current) setPendingDismissalKey(undefined);
      }
    },
    [commitItems, ctx, groupSummaries, pendingDismissalKey],
  );

  if (!ctx?.login) return <SuggestLogin />;
  const visibleItems =
    selectedFilter === "all"
      ? items
      : items.filter(
          item => notificationCategory(item.type) === selectedFilter,
        );
  return (
    <FlatList
      testID="fediverse-notifications-list"
      data={visibleItems}
      keyExtractor={item => item.id}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.7}
      ListHeaderComponent={
        <View>
          <ScrollView
            accessibilityLabel="Notification category filters"
            contentContainerStyle={styles.filters}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {notificationFilters.map(filter => (
              <Pressable
                accessibilityLabel={`Show ${filter.label.toLowerCase()} notifications`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: selectedFilter === filter.value,
                }}
                key={filter.value}
                onPress={() => setSelectedFilter(filter.value)}
                style={styles.filter}
              >
                <Text tint={selectedFilter === filter.value}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {offlineStoredAt !== undefined ? (
            <View accessibilityRole="summary" style={styles.offlineNotice}>
              <Text secondary>
                Offline copy saved {new Date(offlineStoredAt).toLocaleString()}
              </Text>
              {error ? (
                <Text secondary numberOfLines={2}>
                  {error}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        error ? (
          <RetryState message={error} onRetry={() => void refresh()} />
        ) : !refreshing ? (
          <Text style={styles.empty}>
            {items.length > 0
              ? "No notifications in this category."
              : "All caught up."}
          </Text>
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
              <Image
                source={{ uri: item.account.avatar }}
                style={styles.avatar}
              />
            )}
            <View style={styles.body}>
              <Text>
                <Text style={styles.name}>
                  {item.account.display_name || item.account.acct}
                </Text>{" "}
                {notificationLabel(item)}
              </Text>
              {(groupSummaries[item.id]?.count || 1) > 1 ? (
                <Text secondary>
                  {groupSummaries[item.id].count} related notifications
                </Text>
              ) : null}
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
                title={
                  pendingFollowRequestId === item.account.id
                    ? "Saving..."
                    : "Accept"
                }
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
          {groupSummaries[item.id] ? (
            <View style={styles.groupActions}>
              <Pressable
                accessibilityLabel="Dismiss related notifications"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: pendingDismissalKey !== undefined,
                }}
                disabled={pendingDismissalKey !== undefined}
                onPress={() => void dismissGroup(item)}
                style={styles.dismissButton}
              >
                <Icon name="checkmark-done-outline" size={20} />
                <Text>
                  {pendingDismissalKey === groupSummaries[item.id].groupKey
                    ? "Dismissing..."
                    : "Dismiss"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}
const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    padding: 15,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  body: { flex: 1, gap: 5 },
  name: { fontWeight: "700" },
  followRequestActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    paddingBottom: 12,
    paddingHorizontal: 15,
  },
  groupActions: {
    alignItems: "flex-end",
    paddingBottom: 8,
    paddingHorizontal: 15,
  },
  dismissButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  filters: { gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  filter: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  offlineNotice: { gap: 2, paddingHorizontal: 16, paddingVertical: 8 },
  empty: { padding: 30, textAlign: "center" },
});

/* end of UnfathomablyNotificationsScreen.tsx */
