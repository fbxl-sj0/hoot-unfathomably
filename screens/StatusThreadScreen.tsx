/*
    Project: Hoot Mobile
    --------------------------

    File: StatusThreadScreen.tsx

    Purpose:

        Show a status and its Mastodon-compatible reply conversation.
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";
import Icon from "@expo/vector-icons/Ionicons";

import StatusCard from "../components/StatusCard";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";
import { getErrorMessage } from "../utils/error";

const MAX_VISIBLE_ANCESTORS = 100;
const MAX_VISIBLE_DESCENDANTS = 250;

type ThreadItem =
  | {
      key: string;
      kind: "ancestor" | "current" | "descendant";
      status: Unfathomably.UnfathomablyStatus;
    }
  | {
      key: "earlier-heading";
      kind: "earlier-heading";
    };

export default function StatusThreadScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params: { statusId: string } };
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [status, setStatus] = useState<Unfathomably.UnfathomablyStatus>();
  const [replies, setReplies] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [ancestors, setAncestors] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [ancestorCount, setAncestorCount] = useState(0);
  const [descendantCount, setDescendantCount] = useState(0);
  const [statusError, setStatusError] = useState("");
  const [contextError, setContextError] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!ctx?.login) return;

    setStatusLoading(true);
    try {
      setStatusError("");
      setStatus(await Unfathomably.getStatus(ctx, route.params.statusId));
    } catch (reason) {
      setStatusError(getErrorMessage(reason));
    } finally {
      setStatusLoading(false);
    }
  }, [ctx, route.params.statusId]);

  const loadContext = useCallback(async () => {
    if (!ctx?.login) return;

    setContextLoading(true);
    try {
      setContextError("");
      const context = await Unfathomably.getStatusContext(
        ctx,
        route.params.statusId,
      );
      setAncestorCount(context.ancestors.length);
      setDescendantCount(context.descendants.length);
      setAncestors(context.ancestors.slice(-MAX_VISIBLE_ANCESTORS));
      setReplies(context.descendants.slice(0, MAX_VISIBLE_DESCENDANTS));
    } catch (reason) {
      setContextError(getErrorMessage(reason));
    } finally {
      setContextLoading(false);
    }
  }, [ctx, route.params.statusId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadStatus();
      void loadContext();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadContext, loadStatus]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStatus(), loadContext()]);
    setRefreshing(false);
  }, [loadContext, loadStatus]);

  const threadItems = useMemo<ThreadItem[]>(() => {
    if (!status) return [];

    return [
      {
        key: `current:${status.id}`,
        kind: "current",
        status,
      },
      ...replies.map(reply => ({
        key: `descendant:${reply.id}`,
        kind: "descendant" as const,
        status: reply,
      })),
      ...(ancestors.length > 0
        ? [
            {
              key: "earlier-heading" as const,
              kind: "earlier-heading" as const,
            },
            ...[...ancestors].reverse().map(ancestor => ({
              key: `ancestor:${ancestor.id}`,
              kind: "ancestor" as const,
              status: ancestor,
            })),
          ]
        : []),
    ];
  }, [ancestors, replies, status]);

  if (!ctx?.login) return null;

  if (!status) {
    return (
      <View style={styles.root}>
        {statusError ? (
          <RetryState
            message={statusError}
            onRetry={() => void loadStatus()}
          />
        ) : statusLoading ? (
          <Text style={styles.empty}>Loading post…</Text>
        ) : null}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={threadItems}
      keyExtractor={item => item.key}
      renderItem={({ item }) => {
        if (item.kind === "earlier-heading") {
          return (
            <Text style={styles.heading}>
              {ancestorCount > ancestors.length
                ? `Earlier in this discussion (showing ${ancestors.length} of ${ancestorCount})`
                : "Earlier in this discussion"}
            </Text>
          );
        }

        if (item.kind === "current") {
          return (
            <>
              <View
                style={[
                  styles.reply,
                  { borderColor: theme.secondaryBackground },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate("Root", {
                      screen: "NewPostScreen",
                      params: {
                        inReplyToId: status.id,
                      },
                    })
                  }
                >
                  <Text style={{ color: theme.tint }}>
                    <Icon name="arrow-undo-outline" size={19} /> Reply
                  </Text>
                </Pressable>
              </View>
              <StatusCard
                status={item.status}
                ctx={ctx}
                navigation={navigation}
              />
            </>
          );
        }

        return (
          <StatusCard
            status={item.status}
            ctx={ctx}
            navigation={navigation}
            compact={item.kind === "ancestor"}
          />
        );
      }}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      ListFooterComponent={
        contextLoading ? (
          <Text style={styles.empty}>Loading the rest of this discussion…</Text>
        ) : contextError ? (
          <RetryState
            message={`Could not load the rest of this discussion. ${contextError}`}
            onRetry={() => void loadContext()}
          />
        ) : replies.length === 0 ? (
          <Text style={styles.empty}>No replies yet.</Text>
        ) : descendantCount > replies.length ? (
          <Text style={styles.empty}>
            Showing {replies.length} of {descendantCount} replies.
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  reply: { padding: 15, borderBottomWidth: 1 },
  empty: { padding: 28, textAlign: "center" },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 15,
    paddingVertical: 18,
  },
});

/* end of StatusThreadScreen.tsx */
