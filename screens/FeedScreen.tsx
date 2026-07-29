/*
    Project: Hoot Mobile
    -------------------

    File: FeedScreen.tsx

    Purpose:

        Show the authenticated home feed.

    Responsibilities:

        - Render paged posts for the selected sort
        - Support pull-to-refresh and endless loading
        - Handle swipe vote/reply actions

    This file intentionally does NOT contain:

        - post detail rendering
        - community search
*/

import React, { useState } from "react";
import { StyleSheet, FlatList, Pressable, Platform } from "react-native";

import PostDisplay from "../components/PostDisplay";
import { View } from "../components/Themed";
import * as Haptics from "../services/HapticService";
import useFeed from "../hooks/useFeed";
import { RootStackScreenProps, RootTabScreenProps } from "../types";
import useTheme from "../hooks/useTheme";
import SuggestLogin from "../components/SuggestLogin";
import SwipeAction from "../components/SwipeAction";
import useVote from "../hooks/useVote";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { useSelector } from "react-redux";
import { RootState } from "../store/reduxStore";
import { useNavigation } from "@react-navigation/core";
import RetryState from "../components/RetryState";

export default function FeedScreen({
  navigation,
  route,
}: RootTabScreenProps<"FeedScreen">) {
  const sort = route.params.sort;
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [posts, loadNextPage, resetPosts, feedLoadError] = useFeed({
    sort,
    inYourFollows: true,
    enabled: !!ctx?.login,
  });
  if (!ctx?.login) return <SuggestLogin />;
  const renderItem = ({ item }: { item: PostId }) => <Item postId={item} />;
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(postId, index) => `${postId}-${index}`}
        refreshing={posts.length === 0 && !feedLoadError}
        onRefresh={resetPosts}
        onEndReachedThreshold={2}
        onEndReached={loadNextPage}
        ListEmptyComponent={
          feedLoadError ? (
            <RetryState
              compact
              message={feedLoadError}
              onRetry={resetPosts}
              style={styles.emptyState}
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    marginVertical: 0,
    marginHorizontal: 0,
    borderBottomWidth: 8,
  },
  emptyState: {
    padding: 24,
  },
  title: {
    fontSize: 20,
    padding: 15,
    color: "#eeeeee",
  },
  contentText: {
    fontSize: 12,
  },
  link: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: "#88888844",
    borderRadius: 5,
    marginHorizontal: 15,
  },
  image: {
    width: "100%",
    height: undefined,
    resizeMode: "contain",
  },
  foot: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: 15,
  },
  footText: {
    color: "#cccccc",
  },
  by: {
    fontSize: 11,
  },
  score: {
    fontSize: 18,
    color: "#bbbbbb",
  },
});

const Item = ({ postId }: { postId: PostId }) => {
  const post = useSelector((state: RootState) => state.posts.posts[postId]);

  if (!post) return null;

  return <LoadedItem postId={postId} post={post} />;
};

const LoadedItem = ({ postId, post }: { postId: PostId; post: Post }) => {
  const theme = useTheme();
  const navigation = useNavigation<RootStackScreenProps<"Post">["navigation"]>();
  const { isUpvoted, addVote, removeVote } = useVote("post", post);
  const [isCommitting, setIsCommitting] = useState(false);

  return (
    <SwipeAction
      iconLeftSide={
        isUpvoted !== isCommitting
          ? ["heart-dislike", "heart-dislike-outline"]
          : ["heart-outline", "heart"]
      }
      iconRightSide={["arrow-undo-outline", "arrow-undo"]}
      colorLeftSide={theme.red}
      colorRightSide={theme.blue}
      onLeftSide={() => {
        if (isUpvoted) {
          removeVote();
        } else {
          addVote();
        }
        setIsCommitting(true);
      }}
      onRightSide={() => {
        navigation.navigate("Comment", {
          id: post.id,
          title: post.title,
          html: post.content_html ?? "",
          type: "post",
        });
      }}
      onReturnToCenter={() => setIsCommitting(false)}
      backgroundColor={theme.secondaryBackground}
      style={{ borderBottomWidth: 8, borderColor: theme.secondaryBackground }}
    >
      <Pressable
        accessibilityLabel={`Open post ${post.title}`}
        accessibilityRole="button"
        style={{
          width: "100%",
          ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
        }}
        onPress={() => navigation.navigate("Post", { postId })}
        onLongPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)}
      >
        <View style={[]}>
          <PostDisplay
            postId={postId}
            navigation={navigation}
            truncateContent={true}
          />
        </View>
      </Pressable>
    </SwipeAction>
  );
};

/* end of FeedScreen.tsx */
