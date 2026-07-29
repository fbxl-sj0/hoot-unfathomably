/*
    Project: Hoot Mobile
    -------------------

    File: NotificationScreen.tsx

    Purpose:

        Displays a list of notifications (replies to posts or comments)
        for the logged-in user.

    Responsibilities:

        • Fetching user notifications from the Lotide API
        • Rendering notification items with context (original post/comment)
        • Navigating to the relevant post and highlighting the reply
        • Handling pull-to-refresh for new notifications

    This file intentionally does NOT contain:

        • Global notification state management (managed via local state and Redux hooks)
*/

import { useNavigation } from "@react-navigation/core";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";
import ActorDisplayComponent from "../components/ActorDisplay";
import ContentDisplay from "../components/ContentDisplay";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";

import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import usePost from "../hooks/usePost";
import useComment from "../hooks/useComment";
import useTheme from "../hooks/useTheme";
import { useRefreshableData } from "../hooks/useRefreshableData";
import * as LotideService from "../services/LotideService";
import { RootStackScreenProps, RootTabScreenProps } from "../types";

/* ------------------------------------------------------------------------- */
/* Notification Loading                                                      */
/* ------------------------------------------------------------------------- */

type NotificationRefreshHandlers = {
  setNotifications: React.Dispatch<React.SetStateAction<FullNotification[]>>;
  setLoadError: React.Dispatch<React.SetStateAction<string>>;
  stopLoading: () => void;
};

export function refreshNotificationsForScreen(
  ctx: LotideContext | null | undefined,
  {
    setNotifications,
    setLoadError,
    stopLoading,
  }: NotificationRefreshHandlers,
) {
  let isActive = true;

  if (!ctx?.login) {
    setNotifications([]);
    setLoadError("");
    stopLoading();

    return () => {
      isActive = false;
    };
  }

  setLoadError("");
  LotideService.getNotifications(ctx)
    .then(data => {
      if (!isActive) return;

      setNotifications(data);
      setLoadError("");
    })
    .catch(() => {
      if (!isActive) return;

      setLoadError("Cannot load notifications");
    })
    .finally(() => {
      if (isActive) stopLoading();
    });

  return () => {
    isActive = false;
  };
}

/* ------------------------------------------------------------------------- */
/* Notification Screen Component                                             */
/* ------------------------------------------------------------------------- */

export default function NotificationScreen({
  navigation,
}: RootTabScreenProps<"NotificationScreen">) {
  const [notifications, setNotifications] = useState<FullNotification[]>([]);
  const [loadError, setLoadError] = useState("");
  const theme = useTheme();
  const ctx = useLotideCtx();
  const [isRefreshing, refresh] = useRefreshableData(
    stopLoading =>
      refreshNotificationsForScreen(ctx, {
        setNotifications,
        setLoadError,
        stopLoading,
      }),
    [ctx?.login?.token],
  );
  useEffect(
    () => {
      const unsubscribe = navigation.addListener("focus", refresh);
      return unsubscribe;
    },
    [navigation, refresh],
  );

  if (!ctx?.login) return <SuggestLogin />;

  const renderItem = ({ item }: { item: FullNotification }) => (
    <Item item={item} />
  );

  /* ------------------------------------------------------------------------- */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------- */

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.background }]}
      testID="notification-list"
      data={notifications}
      renderItem={renderItem}
      keyExtractor={(item, index) =>
        item.kind === "user_follow"
          ? `user_follow-${item.actor?.id ?? index}`
          : item.kind === "private_message"
          ? `private_message-${item.message.id}`
          : `${item.commentId}-${index}`
      }
      refreshing={isRefreshing}
      onRefresh={() => {
        refresh();
      }}
      ListHeaderComponent={
        notifications.length > 0 && loadError ? (
          <RetryState
            compact
            message={loadError}
            onRetry={refresh}
            style={styles.inlineError}
          />
        ) : null
      }
      ListEmptyComponent={
        !isRefreshing ? (
          <View style={styles.empty}>
            {loadError ? (
              <RetryState compact message={loadError} onRetry={refresh} />
            ) : (
              <Text style={{ color: theme.secondaryText }}>No notifications yet</Text>
            )}
          </View>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------------- */
/* Notification Item Component                                               */
/* ------------------------------------------------------------------------- */

const Item = ({ item }: { item: FullNotification }) => {
  if (item.kind === "user_follow") {
    return <UserFollowItem item={item} />;
  }

  if (item.kind === "private_message") {
    return <PrivateMessageItem item={item} />;
  }

  return <ReplyItem item={item} />;
};

const UserFollowItem = ({ item }: { item: UserFollowNotification }) => {
  const theme = useTheme();
  const navigation =
    useNavigation<RootStackScreenProps<"ProfileActivity">["navigation"]>();
  const followActor = item.actor;

  return (
    <Pressable
      accessibilityLabel={
        followActor
          ? `Open profile for ${followActor.username}`
          : "Open follower profile"
      }
      accessibilityRole="button"
      style={[
        styles.item,
        {
          borderBottomColor: theme.secondaryBackground,
        },
      ]}
      onPress={() => {
        if (!followActor) return;

        navigation.navigate("ProfileActivity", {
          userId: followActor.id,
          username: followActor.username,
        });
      }}
    >
      <Text style={{ color: theme.secondaryText, fontSize: 12, marginBottom: 5 }}>
        New follower
      </Text>
      {followActor ? (
        <ActorDisplayComponent
          name={followActor.username}
          host={followActor.host}
          local={followActor.local ?? false}
          showHost="only_foreign"
          colorize="never"
          userId={followActor.id}
        />
      ) : (
        <Text style={{ color: theme.secondaryText }}>Unknown actor</Text>
      )}
    </Pressable>
  );
};

const PrivateMessageItem = ({ item }: { item: PrivateMessageNotification }) => {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const navigation =
    useNavigation<RootStackScreenProps<"MessageThread">["navigation"]>();
  const partner = LotideService.getPrivateMessagePartner(
    item.message,
    ctx?.login?.user?.id,
  );

  return (
    <Pressable
      accessibilityLabel={`Open message from ${partner.username}`}
      accessibilityRole="button"
      style={[
        styles.item,
        {
          borderBottomColor: theme.secondaryBackground,
        },
      ]}
      onPress={() =>
        navigation.navigate("MessageThread", {
          userId: partner.id,
          username: partner.username,
        })
      }
    >
      <Text style={{ color: theme.secondaryText, fontSize: 12, marginBottom: 5 }}>
        New private message
      </Text>
      <ActorDisplayComponent
        name={partner.username}
        host={partner.host}
        local={partner.local ?? false}
        showHost="only_foreign"
        colorize="only_foreign"
        userId={partner.id}
      />
      <View
        style={[
          styles.level1,
          {
            borderColor: theme.tint,
            backgroundColor: theme.secondaryBackground,
          },
        ]}
      >
        <ContentDisplay
          contentHtml={item.message.content_html}
          contentMarkdown={item.message.content_markdown}
          contentText={item.message.content_text}
          maxChars={240}
        />
      </View>
    </Pressable>
  );
};

function notificationItemLabel(item: ReplyNotification): string {
  if (item.notificationType === "post_mention") {
    return "New mention in a Post";
  }

  if (item.notificationType === "comment_mention") {
    return "New mention in a Comment";
  }

  return `New reply to your ${item.origin.type === "post" ? "Post" : "Comment"}`;
}

const ReplyItem = ({ item }: { item: ReplyNotification }) => {
  const cachedPost = usePost(item.postId);
  const itemOriginType = item.origin.type;
  const cachedComment = useComment(
    itemOriginType === "comment" ? item.commentId : undefined,
  );
  const cachedOriginComment = useComment(
    itemOriginType === "comment" ? item.origin.id : undefined,
  );
  const theme = useTheme();
  const navigation = useNavigation<RootStackScreenProps<"Post">["navigation"]>();
  const post = item.post ?? cachedPost;
  const comment = item.reply ?? cachedComment;
  const originComment = item.comment ?? cachedOriginComment;
  const label = notificationItemLabel(item);
  const title = post?.title ?? `Post ${item.postId}`;

  const openPost = () => {
    const highlightedComments =
      itemOriginType === "comment" && item.origin
        ? [item.origin.id, item.commentId]
        : item.commentId !== item.postId
        ? [item.commentId]
        : undefined;

    navigation.navigate("Post", {
      postId: item.postId,
      highlightedComments,
    });
  };

  if (!post) {
    return (
      <Pressable
        accessibilityLabel={`Open notification for ${title}`}
        accessibilityRole="button"
        style={[
          styles.item,
          {
            borderBottomColor: theme.secondaryBackground,
          },
        ]}
        onPress={openPost}
      >
        <Text style={{ color: theme.secondaryText, fontSize: 12, marginBottom: 5 }}>
          {label}
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={{ color: theme.secondaryText, marginTop: 5 }}>
          Open the post to view the latest activity.
        </Text>
      </Pressable>
    );
  }

  const author = post.author;
  const community = post.community;
  if (itemOriginType === "comment" && (!comment || !originComment)) {
    return (
      <Pressable
        accessibilityLabel={`Open notification for ${title}`}
        accessibilityRole="button"
        style={[
          styles.item,
          {
            borderBottomColor: theme.secondaryBackground,
          },
        ]}
        onPress={openPost}
      >
        <Text style={{ color: theme.secondaryText, fontSize: 12, marginBottom: 5 }}>
          {label}
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={{ color: theme.secondaryText, marginTop: 5 }}>
          Open the post to view the latest reply.
        </Text>
      </Pressable>
    );
  }

  if (itemOriginType === "post" && !comment) {
    return (
      <Pressable
        accessibilityLabel={`Open notification for ${post.title}`}
        accessibilityRole="button"
        style={[
          styles.item,
          {
            borderBottomColor: theme.secondaryBackground,
          },
        ]}
        onPress={openPost}
      >
        <Text
          style={{ color: theme.secondaryText, fontSize: 12, marginBottom: 5 }}
        >
          {label}
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <View
          style={[
            styles.level1,
            {
              borderColor: theme.tint,
              backgroundColor: theme.secondaryBackground,
            },
          ]}
        >
          {author ? (
            <ActorDisplayComponent
              name={author.username}
              host={author.host}
              local={author.local ?? false}
              showHost="only_foreign"
              colorize="only_foreign"
            />
          ) : (
            <Text>Unknown author</Text>
          )}
          <Text style={{ color: theme.secondaryText, marginTop: 5 }}>
            View the post to read the latest reply.
          </Text>
        </View>
      </Pressable>
    );
  }

  if (!comment) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={`Open notification for ${post.title}`}
      accessibilityRole="button"
      style={[
        styles.item,
        {
          borderBottomColor: theme.secondaryBackground,
        },
      ]}
      onPress={openPost}
    >
      <Text
        style={{ color: theme.secondaryText, fontSize: 12, marginBottom: 5 }}
      >
        {label}
      </Text>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {author ? (
        <ActorDisplayComponent
          name={author.username}
          host={author.host}
          local={author.local ?? false}
          showHost="only_foreign"
          colorize="never"
          userId={author.id}
        />
      ) : (
        <Text>Unknown author</Text>
      )}
      {itemOriginType === "comment" &&
      originComment &&
      originComment.id !== comment.id ? (
        <>
          <View style={[styles.level1, { borderColor: theme.secondaryText }]}>
            <ActorOrUnknown actor={originComment.author} />
            <ContentDisplay
              contentHtml={originComment.content_html}
              contentText={originComment.content_text}
            />
          </View>
          <View
            style={[
              styles.level2,
              {
                borderColor: theme.tint,
                backgroundColor: theme.secondaryBackground,
              },
            ]}
          >
            <ActorOrUnknown actor={comment.author} />
            <ContentDisplay
              contentHtml={comment.content_html}
              contentText={comment.content_text}
            />
          </View>
        </>
      ) : (
        <>
          <View
            style={[
              styles.level1,
              {
                borderColor: theme.tint,
                backgroundColor: theme.secondaryBackground,
              },
            ]}
          >
            <ActorOrUnknown actor={comment.author} />
            <ContentDisplay
              contentHtml={comment.content_html}
              contentText={comment.content_text}
            />
          </View>
        </>
      )}
      {community?.name && community.host ? (
        <View style={styles.community}>
          <ActorDisplayComponent
            name={community.name}
            host={community.host}
            local={community.local}
            showHost={"always"}
            colorize={"never"}
            newLine
          />
        </View>
      ) : null}
    </Pressable>
  );
};

function ActorOrUnknown({ actor }: { actor?: Profile }) {
  const theme = useTheme();

  if (!actor) {
    return <Text style={{ color: theme.secondaryText }}>Unknown author</Text>;
  }

  return (
    <ActorDisplayComponent
      name={actor.username}
      host={actor.host}
      local={actor.local ?? false}
      showHost="only_foreign"
      colorize="only_foreign"
      userId={actor.id}
    />
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
    borderBottomWidth: 5,
    padding: 15,
  },
  title: {
    fontSize: 20,
    marginTop: 15,
    marginBottom: 5,
  },
  level1: {
    marginTop: 15,
    borderLeftWidth: 2,
    paddingLeft: 15,
    padding: 5,
  },
  level2: {
    marginTop: 5,
    marginLeft: 15,
    borderLeftWidth: 2,
    paddingLeft: 15,
    padding: 5,
  },
  community: {
    marginTop: 15,
  },
  empty: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineError: {
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
});

/* end of NotificationScreen.tsx */
