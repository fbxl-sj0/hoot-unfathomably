/*
    Project: Hoot Mobile
    -------------------

    File: SourceScreen.tsx

    Purpose:

        Show a Lotide collection target source feed.

    Responsibilities:

        - Gate source detail loading behind the Lotide 0.18 capability
        - Render source metadata, summary, follow state, and preview items
        - Apply and remove source-item likes when supported
        - Navigate to the native source item reader

    This file intentionally does NOT contain:

        - Source-feed list filters
        - Source item comment composition
        - Community post feeds
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from "react-native";
import AppButton from "../components/AppButton";
import ContentDisplay from "../components/ContentDisplay";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import { supportsCollectionTargets } from "../constants/LotideApi";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useTheme from "../hooks/useTheme";
import * as Haptics from "../services/HapticService";
import * as LotideService from "../services/LotideService";
import { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";
import { openExternalLink } from "../utils/externalLink";
import { sourceKindLabel, sourceSoftwareLabel } from "../utils/sourceLabels";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";

export default function SourceScreen({
  route,
}: RootStackScreenProps<"CollectionTarget">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const collectionTargetId = parseFiniteNumber(route.params?.id);
  const [source, setSource] = useState<CollectionTarget | null>(
    getRouteSource(route.params?.source),
  );
  const [loadError, setLoadError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const canUseSources = supportsCollectionTargets(ctx?.apiVersion);

  useEffect(() => {
    if (!ctx?.apiUrl || !canUseSources || !collectionTargetId) return;

    let isActive = true;

    LotideService.getCollectionTarget(ctx, collectionTargetId)
      .then(data => {
        if (!isActive) return;
        setSource(data);
        setLoadError("");
        setHasLoaded(true);
      })
      .catch(() => {
        if (!isActive) return;
        setLoadError("Cannot load source feed");
        setHasLoaded(true);
      })
      .finally(() => {
        if (!isActive) return;
        setIsRefreshing(false);
      });

    return () => {
      isActive = false;
    };
  }, [canUseSources, collectionTargetId, ctx, reloadId]);

  if (!ctx?.apiUrl) {
    return <SuggestLogin />;
  }

  if (!canUseSources) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>
          This Lotide server does not provide source feeds yet.
        </Text>
      </View>
    );
  }

  if (!collectionTargetId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>Cannot load source feed</Text>
      </View>
    );
  }

  function refresh() {
    setLoadError("");
    if (!source) setHasLoaded(false);
    setReloadId(x => x + 1);
  }

  function refreshFromGesture() {
    setLoadError("");
    setIsRefreshing(true);
    setReloadId(x => x + 1);
  }

  if (!source && loadError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <RetryState message={loadError} onRetry={refresh} />
      </View>
    );
  }

  if (!source) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>
          {!hasLoaded ? "Loading source feed" : "Cannot load source feed"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="source-detail-scroll"
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refreshFromGesture} />
      }
    >
      <SourceHeader source={source} onChanged={refresh} />
      {loadError ? (
        <RetryState
          compact
          message={loadError}
          onRetry={refresh}
          style={styles.inlineRetry}
        />
      ) : null}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Preview</Text>
      {source.preview_items.length === 0 ? (
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.secondaryBackground },
          ]}
        >
          <Text style={{ color: theme.secondaryText }}>
            {source.total_items && source.total_items > 0
              ? `This feed reports ${source.total_items} items, but no preview items are available yet.`
              : "No preview items are available yet."}
          </Text>
        </View>
      ) : (
        source.preview_items.map(item => (
          <PreviewItem
            key={item.id}
            collectionTargetId={source.id}
            item={item}
            likesSupported={source.preview_item_likes_supported}
            onChanged={refresh}
          />
        ))
      )}
    </ScrollView>
  );
}

function SourceHeader({
  source,
  onChanged,
}: {
  source: CollectionTarget;
  onChanged: () => void;
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [isFollowActionPending, setIsFollowActionPending] = useState(false);
  const isMountedRef = useRef(true);
  const followActionPendingRef = useRef(false);
  const isFollowing = !!source.your_follow;
  const followLabel = source.your_follow?.accepted ? "Unfollow" : "Cancel Follow";
  const pendingFollowLabel = isFollowing
    ? source.your_follow?.accepted
      ? "Unfollowing..."
      : "Canceling..."
    : "Following...";

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      followActionPendingRef.current = false;
    };
  }, []);

  function alertIfMounted(title: string, message?: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  function startFollowAction() {
    if (followActionPendingRef.current) return false;

    followActionPendingRef.current = true;
    setIsFollowActionPending(true);
    return true;
  }

  function finishFollowAction() {
    followActionPendingRef.current = false;

    if (isMountedRef.current) {
      setIsFollowActionPending(false);
    }
  }

  async function followOrUnfollow() {
    if (!ctx?.login) return;
    if (!startFollowAction()) return;

    try {
      if (isFollowing) {
        await LotideService.unfollowCollectionTarget(ctx, source.id);

        if (isMountedRef.current) {
          onChanged();
        }
        return;
      }

      const result = await LotideService.followCollectionTarget(ctx, source.id);

      if (!isMountedRef.current) return;

      if (!result.accepted) {
        alertIfMounted(
          "Follow request sent",
          "The remote feed has not accepted the follow yet.",
        );
      }

      if (isMountedRef.current) {
        onChanged();
      }
    } catch {
      alertIfMounted(
        isFollowing ? "Failed to unfollow feed" : "Failed to follow feed",
      );
    } finally {
      finishFollowAction();
    }
  }

  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: theme.text }]}>{source.name}</Text>
      <Text style={{ color: theme.secondaryText }}>
        {sourceSoftwareLabel(source.software || source.type)} ·{" "}
        {sourceKindLabel(source.type)}
      </Text>
      <View style={styles.metaRows}>
        <Pressable
          accessibilityLabel="Open original source feed"
          accessibilityRole="link"
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          onPress={() => openExternal(source.remote_url)}
        >
          <Text style={{ color: theme.secondaryTint }}>{source.remote_url}</Text>
        </Pressable>
        {!!source.owner.remote_url && (
          <Text style={{ color: theme.secondaryText }}>
            Owner {source.owner.remote_url}
          </Text>
        )}
        {typeof source.total_items === "number" && (
          <Text style={{ color: theme.secondaryText }}>
            {source.total_items} items reported
          </Text>
        )}
      </View>
      {!!source.summary_html && (
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.secondaryBackground },
          ]}
        >
          <ContentDisplay contentHtml={source.summary_html} />
        </View>
      )}
      {!!ctx?.login && (
        <View style={styles.buttonRow}>
          <AppButton
            title={
              isFollowActionPending
                ? pendingFollowLabel
                : isFollowing
                  ? followLabel
                  : "Follow"
            }
            accessibilityLabel={
              isFollowing ? "Unfollow source feed" : "Follow source feed"
            }
            color={isFollowing ? theme.secondaryTint : theme.tint}
            disabled={isFollowActionPending}
            onPress={() => {
              void followOrUnfollow();
            }}
          />
        </View>
      )}
    </View>
  );
}

function PreviewItem({
  collectionTargetId,
  item,
  likesSupported,
  onChanged,
}: {
  collectionTargetId: CollectionTargetId;
  item: CollectionTargetPreviewItem;
  likesSupported: boolean;
  onChanged: () => void;
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const navigation =
    useNavigation<RootStackScreenProps<"CollectionTarget">["navigation"]>();
  const [isVoting, setIsVoting] = useState(false);
  const isMountedRef = useRef(true);
  const isVotingRef = useRef(false);
  const canVote = !!ctx?.login && likesSupported && !isVoting;
  const voteColor = item.your_vote ? theme.red : theme.secondaryText;

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      isVotingRef.current = false;
    };
  }, []);

  function toggleVote() {
    if (!ctx?.login || !likesSupported || isVotingRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isVotingRef.current = true;
    setIsVoting(true);

    const action = item.your_vote
      ? LotideService.removeCollectionTargetItemVote(
          ctx,
          collectionTargetId,
          item.id,
        )
      : LotideService.applyCollectionTargetItemVote(
          ctx,
          collectionTargetId,
          item.id,
        );

    action
      .then(() => {
        if (!isMountedRef.current) return;

        onChanged();
      })
      .catch(error => {
        if (!isMountedRef.current) return;

        Alert.alert("Vote failed", getErrorMessage(error));
      })
      .finally(() => {
        isVotingRef.current = false;

        if (isMountedRef.current) {
          setIsVoting(false);
        }
      });
  }

  return (
    <Pressable
      accessibilityLabel={`Open source item ${item.name}`}
      accessibilityRole="button"
      onPress={() =>
        navigation.navigate("CollectionTargetItem", {
          collectionTargetId,
          itemId: item.id,
          title: item.name,
        })
      }
      style={[
        styles.previewRow,
        {
          borderColor: theme.secondaryBackground,
        },
      ]}
    >
      <View style={styles.previewText}>
        <Text style={[styles.previewTitle, { color: theme.text }]}>
          {item.name}
        </Text>
        <Text style={{ color: theme.secondaryText }}>
          {[item.type, item.published].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {!!ctx?.login && (
        <Pressable
          accessibilityLabel={
            item.your_vote ? "Remove source item like" : "Like source item"
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !canVote }}
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          disabled={!canVote}
          onPress={toggleVote}
          style={[styles.voteButton, isVoting && styles.disabledButton]}
        >
          <Icon
            name={item.your_vote ? "heart" : "heart-outline"}
            size={25}
            color={
              likesSupported || item.your_vote
                ? voteColor
                : theme.tertiaryBackground
            }
          />
        </Pressable>
      )}
    </Pressable>
  );
}

function getRouteSource(
  value?: Partial<CollectionTarget> | Partial<CollectionTargetListItem>,
): CollectionTarget | null {
  if (!value?.id || !value.name || !value.remote_url || !value.type) {
    return null;
  }

  return {
    id: value.id,
    type: value.type,
    software: value.software || null,
    name: value.name,
    remote_url: value.remote_url,
    owner: value.owner || {},
    followers: null,
    first_page: null,
    last_page: null,
    summary_html: null,
    total_items: value.total_items ?? null,
    your_follow: value.your_follow,
    latest_unfollow_status: value.latest_unfollow_status,
    preview_item_likes_supported: true,
    preview_items: [],
  };
}

function parseFiniteNumber(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function openExternal(url: string) {
  void openExternalLink(url);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
  },
  metaRows: {
    gap: 6,
    marginTop: 12,
  },
  infoBox: {
    borderRadius: 8,
    marginTop: 14,
    padding: 12,
  },
  buttonRow: {
    alignItems: "flex-start",
    marginTop: 14,
  },
  inlineRetry: {
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  previewRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth || 1,
    flexDirection: "row",
    marginHorizontal: 16,
    minHeight: 64,
    paddingVertical: 12,
  },
  previewText: {
    flex: 1,
    paddingRight: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  voteButton: {
    alignItems: "center",
    height: MINIMUM_TOUCH_TARGET_SIZE,
    justifyContent: "center",
    width: MINIMUM_TOUCH_TARGET_SIZE,
  },
  disabledButton: {
    opacity: 0.6,
  },
});

/* end of SourceScreen.tsx */
