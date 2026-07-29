/*
    Project: Hoot Mobile
    -------------------

    File: PostDisplay.tsx

    Purpose:

        Render a single Lotide post body and metadata.

    Responsibilities:

        - Load missing post data when needed
        - Render author, content, link, community, score, and reply count
        - Provide retry handling for failed post loads

    This file intentionally does NOT contain:

        - feed pagination
        - comment tree rendering
*/

import React, { useState } from "react";
import Icon from "@expo/vector-icons/Ionicons";
import { StyleSheet, Pressable, Platform, ViewStyle } from "react-native";
import ElapsedTime from "./ElapsedTime";
import VoteCounter from "./VoteCounter";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import ContentDisplay from "./ContentDisplay";
import ActorDisplayComponent from "./ActorDisplay";
import usePost from "../hooks/usePost";
import HrefDisplay from "./HrefDisplay";
import RetryState from "./RetryState";
import { RootTabScreenProps } from "../types";
import { TOUCH_TARGET_HIT_SLOP } from "../constants/TouchTargets";

type PostDisplayNavigation = Pick<
  RootTabScreenProps<"FeedScreen">["navigation"],
  "navigate"
>;

export interface PostDisplayProps {
  postId: PostId;
  navigation: PostDisplayNavigation;
  truncateContent?: boolean;
  showAuthor?: boolean;
}

export default function PostDisplay(props: PostDisplayProps) {
  const [reloadId, setReloadId] = useState(0);
  const post = usePost(props.postId, reloadId);
  const theme = useTheme();

  if (!post) {
    return (
      <RetryState
        compact
        message="Cannot load post"
        onRetry={() => setReloadId(x => x + 1)}
        style={styles.retry}
      />
    );
  }

  const author = post.author;
  const community = post.community;
  const canOpenCommunity = !!community?.id && !!community.name && !!community.host;

  return (
    <View>
      <Text style={styles.title}>
        {post.sticky && (
          <>
            <Icon name="pin" size={25} color={theme.secondaryTint} />{" "}
          </>
        )}
        {post.title.trim()}
      </Text>
      {author ? (
        <ActorDisplayComponent
          name={author.username}
          host={author.host}
          local={author.local ?? false}
          showHost={"only_foreign"}
          colorize={"never"}
          newLine={true}
          userId={author.id}
          style={styles.username}
        />
      ) : (
        <Text style={styles.username}>Unknown author</Text>
      )}
      {!!post.href && <HrefDisplay href={post.href} />}
      {!!post.href && !!post.content_html && <View style={{ marginTop: 15 }} />}
      {!!post.content_html && (
        <View style={{ paddingHorizontal: 15 }}>
          <ContentDisplay
            contentHtml={post.content_html}
            contentText={post.content_text}
            maxChars={props.truncateContent ? 256 : undefined}
            postId={post.id}
          />
        </View>
      )}
      <View style={styles.foot}>
        <Pressable
          accessibilityLabel={
            canOpenCommunity
              ? `Open community ${community.name}@${community.host}`
              : "Unknown community"
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !canOpenCommunity }}
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          onPress={() =>
            canOpenCommunity &&
            props.navigation.navigate("Community", {
              community,
            })
          }
          disabled={!canOpenCommunity}
          style={[
            styles.footItem,
            canOpenCommunity ? styles.pointer : styles.disabled,
          ]}
        >
          {canOpenCommunity ? (
            <ActorDisplayComponent
              name={community.name}
              host={community.host}
              local={community.local}
              showHost={"only_foreign"}
              colorize={props.showAuthor ? "always" : "never"}
              newLine={true}
            />
          ) : (
            <Text>Unknown community</Text>
          )}
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={styles.footItem}>
          <ElapsedTime time={post.created} />
        </View>
        <View style={styles.footItem}>
          <Text style={styles.footText}>
            <Icon name="chatbubble-outline" size={12} />{" "}
            {post.replies_count_total}
          </Text>
        </View>
        <View style={styles.footItem}>
          <VoteCounter type="post" content={post} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    marginVertical: 0,
    marginHorizontal: 0,
  },
  pointer: {
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  } as ViewStyle,
  title: {
    fontSize: 20,
    padding: 15,
  },
  username: {
    paddingLeft: 15,
    paddingBottom: 15,
  },
  contentText: {
    fontSize: 12,
  },
  link: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginHorizontal: 15,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
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
  },
  footText: {},
  footItem: {
    padding: 15,
  },
  disabled: {
    opacity: 0.65,
  },
  by: {
    fontSize: 11,
  },
  score: {
    fontSize: 18,
  },
  actions: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    padding: 10,
  },
  retry: {
    padding: 15,
  },
});

/* end of PostDisplay.tsx */
