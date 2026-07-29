/*
    Project: Hoot Mobile
    -------------------

    File: ProfileActivityScreen.tsx

    Purpose:

        Displays the mixed post and comment activity exposed by the
        Lotide user "things" API.

    Responsibilities:

        • Fetch profile activity for the selected user
        • Render post and comment activity entries
        • Navigate activity entries to the related post screen
        • Handle empty, loading, and failed API states without crashing

    This file intentionally does NOT contain:

        • Profile editing
        • Account switching or logout behavior
        • Moderation workflows
*/

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";
import ActorDisplayComponent from "../components/ActorDisplay";
import ContentDisplay from "../components/ContentDisplay";
import ElapsedTime from "../components/ElapsedTime";
import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import {
  supportsPrivateMessages,
  supportsUserFollows,
} from "../constants/LotideApi";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as LotideService from "../services/LotideService";
import type { UserThing } from "../services/LotideService";
import { RootStackScreenProps } from "../types";

/* ------------------------------------------------------------------------- */
/* Profile Activity Screen                                                   */
/* ------------------------------------------------------------------------- */

type ActivityLoadState = {
  items: UserThing[];
  nextPage?: string | null;
  loadError: string;
  scopeKey?: string;
  isLoading: boolean;
};

type ProfileLoadState = {
  profile?: Profile;
  profileError: string;
  scopeKey?: string;
};

export default function ProfileActivityScreen({
  navigation,
  route,
}: RootStackScreenProps<"ProfileActivity">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const userId = route.params?.userId ?? ctx?.login?.user?.id;
  const [activityState, setActivityState] = useState<ActivityLoadState>({
    items: [],
    loadError: "",
    isLoading: true,
  });
  const [profileState, setProfileState] = useState<ProfileLoadState>({
    profileError: "",
  });
  const nextPageRequestKey = useRef<string | null>(null);
  const [reloadId, setReloadId] = useState(0);
  const isOwnProfile = userId === ctx?.login?.user?.id;
  const activityScopeKey =
    `${ctx?.apiUrl ?? ""}::${ctx?.login?.token ?? ""}::${userId ?? ""}`;
  const isCurrentActivityScope = activityState.scopeKey === activityScopeKey;
  const isCurrentProfileScope = profileState.scopeKey === activityScopeKey;
  const items = isCurrentActivityScope ? activityState.items : [];
  const nextPage = isCurrentActivityScope ? activityState.nextPage : undefined;
  const loadError = isCurrentActivityScope ? activityState.loadError : "";
  const isLoading = activityState.isLoading || !isCurrentActivityScope;
  const profile = isCurrentProfileScope ? profileState.profile : undefined;
  const profileError = isCurrentProfileScope
    ? profileState.profileError
    : "";

  useEffect(() => {
    if (!ctx?.apiUrl || !userId) return;

    let isActive = true;
    const requestScopeKey = activityScopeKey;

    LotideService.getUserThings(ctx, userId)
      .then(data => {
        if (!isActive) return;

        setActivityState({
          items: data.items || [],
          nextPage: data.next_page,
          loadError: "",
          scopeKey: requestScopeKey,
          isLoading: false,
        });
      })
      .catch(() => {
        if (!isActive) return;

        setActivityState(previousState => {
          const canPreserveItems =
            previousState.scopeKey === requestScopeKey;

          return {
            items: canPreserveItems ? previousState.items : [],
            nextPage: canPreserveItems ? previousState.nextPage : null,
            loadError: "Cannot load activity",
            scopeKey: requestScopeKey,
            isLoading: false,
          };
        });
      });

    return () => {
      isActive = false;
    };
  }, [activityScopeKey, ctx, userId, reloadId]);

  useEffect(() => {
    if (!ctx?.login || !userId) return;

    let isActive = true;
    const requestScopeKey = activityScopeKey;

    LotideService.getUserData(ctx, userId)
      .then(data => {
        if (!isActive) return;

        setProfileState({
          profile: data,
          profileError: "",
          scopeKey: requestScopeKey,
        });
      })
      .catch(() => {
        if (!isActive) return;

        setProfileState(previousState => ({
          profile:
            previousState.scopeKey === requestScopeKey
              ? previousState.profile
              : undefined,
          profileError: "Cannot load profile",
          scopeKey: requestScopeKey,
        }));
      });

    return () => {
      isActive = false;
    };
  }, [activityScopeKey, ctx, userId, reloadId]);

  if (!ctx?.login) return <SuggestLogin />;

  const retryLoad = () => {
    nextPageRequestKey.current = null;
    setActivityState(previousState => ({
      ...previousState,
      loadError: "",
      isLoading: true,
    }));
    setReloadId(x => x + 1);
  };

  const loadNextPage = () => {
    if (!ctx?.apiUrl || !userId || !nextPage) return;

    const requestScopeKey = activityScopeKey;
    const requestPageKey = `${requestScopeKey}::${nextPage}`;

    if (nextPageRequestKey.current === requestPageKey) return;

    nextPageRequestKey.current = requestPageKey;

    LotideService.getUserThings(ctx, userId, nextPage)
      .then(data => {
        setActivityState(previousState => {
          if (previousState.scopeKey !== requestScopeKey) {
            return previousState;
          }

          return {
            ...previousState,
            items: mergeActivityItems(previousState.items, data.items || []),
            nextPage: data.next_page,
            loadError: "",
          };
        });
      })
      .catch(() => {
        setActivityState(previousState =>
          previousState.scopeKey === requestScopeKey
            ? {
                ...previousState,
                nextPage: null,
              }
            : previousState,
        );
      })
      .finally(() => {
        if (nextPageRequestKey.current === requestPageKey) {
          nextPageRequestKey.current = null;
        }
      });
  };

  const renderItem = ({ item }: { item: UserThing }) => (
    <ActivityItem item={item} navigation={navigation} />
  );

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.background }]}
      testID="profile-activity-list"
      data={items}
      renderItem={renderItem}
      keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
      onEndReached={loadNextPage}
      onEndReachedThreshold={2}
      refreshing={isLoading && items.length > 0}
      onRefresh={retryLoad}
      ListHeaderComponent={
        <>
          <ProfileActivityHeader
            isOwnProfile={isOwnProfile}
            onChanged={retryLoad}
            profile={profile}
            profileError={profileError}
            routeUsername={route.params?.username}
            userId={userId}
            navigation={navigation}
          />
          {items.length > 0 && loadError ? (
            <RetryState
              compact
              message={loadError}
              onRetry={retryLoad}
              style={styles.inlineError}
            />
          ) : null}
        </>
      }
      ListEmptyComponent={
        !isLoading ? (
          <View style={styles.empty}>
            {loadError ? (
              <RetryState compact message={loadError} onRetry={retryLoad} />
            ) : (
              <Text style={{ color: theme.secondaryText }}>No activity yet</Text>
            )}
          </View>
        ) : null
      }
    />
  );
}

function mergeActivityItems(
  currentItems: UserThing[],
  incomingItems: UserThing[],
) {
  const seen = new Set(currentItems.map(activityItemKey));
  const merged = [...currentItems];

  incomingItems.forEach(item => {
    const key = activityItemKey(item);

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  });

  return merged;
}

function activityItemKey(item: UserThing) {
  return `${item.type}:${item.id}`;
}

/* ------------------------------------------------------------------------- */
/* Profile Header                                                            */
/* ------------------------------------------------------------------------- */

function ProfileActivityHeader({
  isOwnProfile,
  navigation,
  onChanged,
  profile,
  profileError,
  routeUsername,
  userId,
}: {
  isOwnProfile: boolean;
  navigation: RootStackScreenProps<"ProfileActivity">["navigation"];
  onChanged: () => void;
  profile?: Profile;
  profileError: string;
  routeUsername?: string;
  userId?: UserId;
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const canFollowUsers = supportsUserFollows(ctx?.apiVersion);
  const canMessage = supportsPrivateMessages(ctx?.apiVersion);
  const isFollowing = !!profile?.your_follow;
  const displayName = profile?.username || routeUsername;
  const [isFollowActionPending, setIsFollowActionPending] = useState(false);
  const isMountedRef = useRef(true);
  const followActionPendingRef = useRef(false);
  const followLabel = profile?.your_follow?.accepted
    ? "Unfollow"
    : "Cancel Follow";
  const pendingFollowLabel = isFollowing
    ? profile?.your_follow?.accepted
      ? "Unfollowing..."
      : "Canceling..."
    : "Following...";

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      followActionPendingRef.current = false;
    };
  }, []);

  if (!userId || (!profile && !profileError && !routeUsername)) {
    return null;
  }

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
    if (!ctx?.login || !userId || isOwnProfile || !canFollowUsers) return;
    if (!startFollowAction()) return;

    try {
      if (isFollowing) {
        await LotideService.unfollowUser(ctx, userId);

        if (isMountedRef.current) {
          onChanged();
        }
        return;
      }

      const result = await LotideService.followUser(ctx, userId);

      if (!isMountedRef.current) return;

      if (!result.accepted) {
        alertIfMounted(
          "Follow request sent",
          "The remote user has not accepted the follow yet.",
        );
      }

      if (isMountedRef.current) {
        onChanged();
      }
    } catch {
      alertIfMounted(
        isFollowing ? "Failed to unfollow user" : "Failed to follow user",
      );
    } finally {
      finishFollowAction();
    }
  }

  return (
    <View
      style={[
        styles.profileHeader,
        { borderBottomColor: theme.secondaryBackground },
      ]}
    >
      {profile ? (
        <>
          <ActorDisplayComponent
            name={profile.username}
            host={profile.host}
            local={profile.local ?? false}
            showHost="always"
            colorize="only_foreign"
            userId={profile.id}
            styleName={styles.profileName}
          />
          {typeof profile.description === "string" ? (
            <Text style={{ color: theme.secondaryText }}>
              {profile.description}
            </Text>
          ) : profile.description ? (
            <View style={styles.profileDescription}>
              <ContentDisplay
                contentHtml={profile.description.content_html}
                contentMarkdown={profile.description.content_markdown}
                contentText={profile.description.content_text}
                maxChars={400}
              />
            </View>
          ) : null}
        </>
      ) : (
        <Text style={[styles.profileName, { color: theme.text }]}>
          {displayName || `User ${userId}`}
        </Text>
      )}
      {profileError ? (
        <Text style={{ color: theme.secondaryText }}>{profileError}</Text>
      ) : null}
      {!isOwnProfile && (
        <View style={styles.profileActions}>
          {canFollowUsers ? (
            <Pressable
              accessibilityLabel={
                isFollowing
                  ? `Unfollow ${displayName || "user"}`
                  : `Follow ${displayName || "user"}`
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: isFollowActionPending }}
              disabled={isFollowActionPending}
              onPress={() => {
                void followOrUnfollow();
              }}
              style={[
                styles.profileActionButton,
                {
                  backgroundColor: isFollowing
                    ? theme.secondaryBackground
                    : theme.tint,
                  opacity: isFollowActionPending ? 0.72 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: isFollowing ? theme.text : "#111827",
                  fontWeight: "600",
                }}
              >
                {isFollowActionPending
                  ? pendingFollowLabel
                  : isFollowing
                    ? followLabel
                    : "Follow"}
              </Text>
            </Pressable>
          ) : null}
          {canMessage ? (
            <Pressable
              accessibilityLabel={`Message ${displayName || "user"}`}
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate("MessageThread", {
                  userId,
                  username: displayName,
                })}
              style={[
                styles.profileActionButton,
                { backgroundColor: theme.secondaryBackground },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: "600" }}>
                Message
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------------- */
/* Activity Items                                                            */
/* ------------------------------------------------------------------------- */

function ActivityItem({
  item,
  navigation,
}: {
  item: UserThing;
  navigation: RootStackScreenProps<"ProfileActivity">["navigation"];
}) {
  if (item.type === "post") {
    return <PostActivityItem item={item} navigation={navigation} />;
  }

  return <CommentActivityItem item={item} navigation={navigation} />;
}

function PostActivityItem({
  item,
  navigation,
}: {
  item: Extract<UserThing, { type: "post" }>;
  navigation: RootStackScreenProps<"ProfileActivity">["navigation"];
}) {
  const theme = useTheme();
  const community = item.community;
  const author = item.author;

  return (
    <Pressable
      accessibilityLabel={`Open post ${item.title}`}
      accessibilityRole="button"
      onPress={() => navigation.navigate("Post", { postId: item.id })}
      style={[styles.item, { borderBottomColor: theme.secondaryBackground }]}
    >
      <Text style={styles.typeLabel}>Post</Text>
      <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
      {author ? (
        <ActorDisplayComponent
          name={author.username}
          host={author.host}
          local={author.local ?? false}
          showHost="only_foreign"
          colorize="never"
          userId={author.id}
        />
      ) : null}
      {community?.name && community.host ? (
        <View style={styles.meta}>
          <ActorDisplayComponent
            name={community.name}
            host={community.host}
            local={community.local}
            showHost="only_foreign"
            colorize="only_foreign"
          />
        </View>
      ) : null}
      {item.created ? (
        <View style={styles.meta}>
          <ElapsedTime time={item.created} />
        </View>
      ) : null}
    </Pressable>
  );
}

function CommentActivityItem({
  item,
  navigation,
}: {
  item: Extract<UserThing, { type: "comment" }>;
  navigation: RootStackScreenProps<"ProfileActivity">["navigation"];
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={`Open comment on ${item.post.title}`}
      accessibilityRole="button"
      onPress={() =>
        navigation.navigate("Post", {
          postId: item.post.id,
          highlightedComments: [item.id],
        })
      }
      style={[styles.item, { borderBottomColor: theme.secondaryBackground }]}
    >
      <Text style={styles.typeLabel}>Comment</Text>
      <Text style={[styles.title, { color: theme.text }]}>{item.post.title}</Text>
      {item.created ? (
        <View style={styles.meta}>
          <ElapsedTime time={item.created} />
        </View>
      ) : null}
      <View style={styles.content}>
        <ContentDisplay
          contentHtml={item.content_html || undefined}
          contentText={item.content_text || undefined}
          maxChars={300}
        />
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------------- */
/* Styles                                                                    */
/* ------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    borderBottomWidth: 8,
    padding: 15,
  },
  profileHeader: {
    borderBottomWidth: 8,
    padding: 15,
  },
  profileName: {
    fontSize: 20,
    marginBottom: 8,
  },
  profileDescription: {
    marginTop: 8,
  },
  profileActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  profileActionButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 18,
    marginBottom: 8,
  },
  meta: {
    marginTop: 8,
  },
  content: {
    marginTop: 10,
  },
  empty: {
    padding: 40,
    alignItems: "center",
  },
  inlineError: {
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
});

/* end of ProfileActivityScreen.tsx */
