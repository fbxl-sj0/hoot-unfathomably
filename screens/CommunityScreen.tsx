/*
    Project: Hoot Mobile
    -------------------

    File: CommunityScreen.tsx

    Purpose:

        Show a community profile and its posts.

    Responsibilities:

        - Load community metadata by route id
        - Render follow/edit actions
        - Page through community posts

    This file intentionally does NOT contain:

        - community search
        - new post composition
*/

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";
import AppButton from "../components/AppButton";
import { View, Text } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { RootStackScreenProps } from "../types";
import * as Haptics from "../services/HapticService";
import * as LotideService from "../services/LotideService";
import PostDisplay from "../components/PostDisplay";
import { ActorDisplay } from "../components/ActorDisplay";
import { useNavigation } from "@react-navigation/native";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useFeed from "../hooks/useFeed";
import ContentDisplay from "../components/ContentDisplay";
import RetryState from "../components/RetryState";

export default function CommunityScreen({
  route,
}: RootStackScreenProps<"Community">) {
  const [communityLoadError, setCommunityLoadError] = useState("");
  const routeCommunity = route.params?.community;
  const communityId = getRouteCommunityId(route.params);
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, loadNextPage, refreshPosts, feedLoadError] = useFeed({
    sort: "hot",
    communityId,
    enabled: !!communityId,
  });
  const [reloadId, setReloadId] = useState(0);
  const theme = useTheme();
  const ctx = useLotideCtx();
  const currentCommunity = getRenderableCommunity(routeCommunity) || community;

  const retryCommunityLoad = () => {
    setCommunityLoadError("");
    setReloadId(x => x + 1);
  };

  useEffect(() => {
    if (!ctx || !communityId) return;

    LotideService.getCommunity(ctx, communityId)
      .then(data => {
        setCommunity(data);
        setCommunityLoadError("");
      })
      .catch(() => {
        setCommunity(null);
        setCommunityLoadError("Cannot load community");
      });
  }, [ctx, communityId, reloadId]);

  if (!currentCommunity) {
    return (
      <View
        style={[styles.root, { backgroundColor: theme.background }]}
      >
        {communityLoadError && communityId ? (
          <RetryState
            message={communityLoadError}
            onRetry={retryCommunityLoad}
            style={styles.emptyState}
          />
        ) : (
          <Text>
            {communityId ? "Loading community" : "Cannot load community"}
          </Text>
        )}
      </View>
    );
  }

  const renderItem = ({ item }: { item: PostId }) => <Item postId={item} />;

  const feedList = (
    <FlatList
      data={posts}
      renderItem={renderItem}
      ListHeaderComponent={
        <ListHeader
          community={currentCommunity}
          communityLoadError={communityLoadError}
          onRetryCommunity={retryCommunityLoad}
          setReloadId={setReloadId}
        />
      }
      ListEmptyComponent={
        feedLoadError ? (
          <RetryState
            compact
            message={feedLoadError}
            onRetry={refreshPosts}
            style={[styles.emptyState, { borderColor: theme.secondaryBackground }]}
          />
        ) : null
      }
      keyExtractor={(postId, index) => `${postId}-${index}`}
      refreshing={posts.length === 0 && !feedLoadError}
      onRefresh={refreshPosts}
      onEndReachedThreshold={2}
      onEndReached={loadNextPage}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {feedList}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: "100%",
  },
  header: {
    padding: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth || 1,
  },
  title: {
    fontSize: 20,
  },
  description: {
    marginTop: 10,
  },
  buttons: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
    justifyContent: "flex-start",
    marginTop: 15,
  },
  headerButton: {
    minWidth: 88,
  },
  item: {
    marginVertical: 0,
    marginHorizontal: 0,
    borderBottomWidth: 8,
  },
  emptyState: {
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth || 1,
  },
  headerRetry: {
    marginTop: 15,
  },
});

function getRouteCommunityId(
  params: RootStackScreenProps<"Community">["route"]["params"],
): CommunityId | undefined {
  const rawId = params?.community?.id ?? params?.id;

  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return rawId;
  }

  if (typeof rawId === "string" && rawId.trim() !== "") {
    const numericId = Number(rawId);
    if (Number.isFinite(numericId)) {
      return numericId;
    }
  }

  return undefined;
}

function getRenderableCommunity(
  community?: Partial<Community>,
): Community | null {
  if (!community?.id || !community.name || !community.host) {
    return null;
  }

  return community as Community;
}

const Item = ({ postId }: { postId: PostId }) => {
  const theme = useTheme();
  const navigation = useNavigation<RootStackScreenProps<"Community">["navigation"]>();
  return (
    <Pressable
      onPress={() => navigation.navigate("Post", { postId })}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }}
    >
      <View
        style={[styles.item, { borderBottomColor: theme.secondaryBackground }]}
      >
        <PostDisplay postId={postId} navigation={navigation} truncateContent />
      </View>
    </Pressable>
  );
};

type ListHeaderProps = {
  community: Community;
  communityLoadError: string;
  onRetryCommunity: () => void;
  setReloadId: (a: (x: number) => number) => void;
};

const ListHeader = React.memo(function ListHeader(props: ListHeaderProps) {
  const theme = useTheme();
  const navigation = useNavigation<RootStackScreenProps<"Community">["navigation"]>();
  const community = props.community;
  const communityLoadError = props.communityLoadError;
  const onRetryCommunity = props.onRetryCommunity;
  const setReloadId = props.setReloadId;
  const ctx = useLotideCtx();
  const [isFollowActionPending, setIsFollowActionPending] = useState(false);
  const isMountedRef = useRef(true);
  const followActionPendingRef = useRef(false);

  const isFollowing = community.your_follow?.accepted || false;

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

  async function follow() {
    if (!ctx?.login) return;
    if (!startFollowAction()) return;

    try {
      const data = await LotideService.followCommunity(ctx, community.id);

      if (!isMountedRef.current) return;

      if (data.accepted === false) {
        alertIfMounted(
          "Follow request not accepted yet.",
          "This can happen while the other node is still processing it.",
        );
      }

      if (isMountedRef.current) {
        setReloadId(x => x + 1);
      }
    } catch {
      alertIfMounted("Failed to follow community");
    } finally {
      finishFollowAction();
    }
  }

  async function unfollow() {
    if (!ctx?.login) return;
    if (!startFollowAction()) return;

    try {
      await LotideService.unfollowCommunity(ctx, community.id);

      if (isMountedRef.current) {
        setReloadId(x => x + 1);
      }
    } catch {
      alertIfMounted("Failed to unfollow community");
    } finally {
      finishFollowAction();
    }
  }

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: theme.tertiaryBackground,
        },
      ]}
    >
      <View>
        <ActorDisplay
          name={community.name}
          host={community.host}
          local={community.local}
          newLine={true}
          colorize="always"
          showHost="always"
          styleName={[styles.title]}
        />
        {community.description !== "" &&
          (typeof community.description === "string" ? (
            <Text style={styles.description}>{community.description}</Text>
          ) : (
            <ContentDisplay
              contentHtml={community.description?.content_html}
              contentMarkdown={community.description?.content_markdown}
              contentText={community.description?.content_text}
            />
          ))}
        {communityLoadError ? (
          <RetryState
            compact
            message={communityLoadError}
            onRetry={onRetryCommunity}
            style={styles.headerRetry}
          />
        ) : null}
      </View>
      {!!ctx?.login && (
        <View style={[styles.buttons]}>
          <AppButton
            onPress={() => navigation.navigate("NewPostScreen", { community })}
            title="Post"
            color={theme.tint}
            accessibilityLabel="Post to this community"
            style={styles.headerButton}
          />
          {community.you_are_moderator && (
            <AppButton
              onPress={() =>
                navigation.navigate("EditCommunity", { community })
              }
              title="Edit"
              color={theme.tint}
              accessibilityLabel="Edit your community community"
              style={styles.headerButton}
            />
          )}
          {isFollowing ? (
            <AppButton
              onPress={() => {
                void unfollow();
              }}
              title={isFollowActionPending ? "Unfollowing..." : "Unfollow"}
              color={theme.secondaryTint}
              accessibilityLabel="Stop seeing posts from this community"
              disabled={isFollowActionPending}
              style={styles.headerButton}
            />
          ) : (
            <AppButton
              onPress={() => {
                void follow();
              }}
              title={isFollowActionPending ? "Following..." : "Follow"}
              color={theme.tint}
              accessibilityLabel="See posts from this community in your feed"
              disabled={isFollowActionPending}
              style={styles.headerButton}
            />
          )}
        </View>
      )}
    </View>
  );
});

/* end of CommunityScreen.tsx */
