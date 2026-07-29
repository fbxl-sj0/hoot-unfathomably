/*
    Project: Hoot Mobile
    -------------------

    File: CommentsDisplay.tsx

    Purpose:

        Render a threaded comment tree for posts and comments.

    Responsibilities:

        - Load comment children through the comment hooks
        - Render nested replies with voting and reply actions
        - Show retry states for failed comment loads

    This file intentionally does NOT contain:

        - post fetching
        - comment submission forms
*/

import React from "react";
import { ColorValue, Pressable, StyleSheet, View } from "react-native";
import Icon from "@expo/vector-icons/Ionicons";
import { Text } from "./Themed";
import useTheme from "../hooks/useTheme";
import * as Haptics from "../services/HapticService";
import ElapsedTime from "./ElapsedTime";
import ContentDisplay from "./ContentDisplay";
import VoteCounter from "./VoteCounter";
import ActorDisplayComponent from "./ActorDisplay";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useComments from "../hooks/useComments";
import useComment from "../hooks/useComment";
import useSelectedComment from "../hooks/useSelectedComment";
import RetryState from "./RetryState";
import { RootTabScreenProps } from "../types";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";

type CommentsNavigation = Pick<
  RootTabScreenProps<"FeedScreen">["navigation"],
  "navigate"
>;

export interface CommentsDisplayProps {
  parentType: ContentType;
  parentId: number;
  navigation: CommentsNavigation;
  layer?: number;
  postId?: PostId;
  highlightedComments?: CommentId[];
  reloadId?: number;
}

export default function CommentsDisplay({
  parentType,
  parentId,
  navigation,
  layer = 0,
  postId,
  highlightedComments = [],
  reloadId = 0,
}: CommentsDisplayProps) {
  const { comments, isLoading, loadError, loadNextPage } = useComments(
    parentType,
    parentId,
    reloadId,
  );
  const theme = useTheme();
  const ctx = useLotideCtx();
  if (!ctx) return null;
  const layerColors = [
    theme.text,
    theme.red,
    theme.orange,
    theme.yellow,
    theme.green,
    theme.teal,
    theme.blue,
    theme.indigo,
    theme.purple,
  ];

  if (!comments) {
    if (loadError) {
      return (
        <RetryState
          compact
          message={loadError}
          onRetry={loadNextPage}
          style={styles.retry}
        />
      );
    }

    return (
      <Text
        accessibilityState={{ busy: isLoading }}
        style={{ margin: 17, color: theme.secondaryText }}
      >
        Loading comments
      </Text>
    );
  }

  return (
    <View>
      {comments.items.map(commentId => (
        <CommentDisplay
          commentId={commentId}
          layer={layer}
          key={commentId}
          navigation={navigation}
          layerColors={layerColors}
          postId={postId}
          highlightedComments={highlightedComments}
          reloadId={reloadId}
        />
      ))}
      {loadError ? (
        <RetryState
          compact
          message={loadError}
          onRetry={loadNextPage}
          style={styles.retry}
        />
      ) : comments.next_page !== null ? (
        <Pressable
          accessibilityLabel="Load more comments"
          accessibilityRole="button"
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          onPress={loadNextPage}
          style={styles.moreComments}
        >
          <Text style={{ color: theme.tint }}>
            More comments <Icon name="chevron-down-outline" />
          </Text>
        </Pressable>
      ) : null}
      {comments.next_page === null && layer === 0 && (
        <Text style={{ margin: 17, color: theme.secondaryText }}>
          {comments.items.length > 0 ? "No more comments" : "No comments yet"}
        </Text>
      )}
    </View>
  );
}

function CommentDisplay({
  commentId,
  layer = 0,
  navigation,
  layerColors,
  postId,
  highlightedComments = [],
  reloadId,
}: {
  commentId: CommentId;
  layer: number;
  navigation: CommentsNavigation;
  layerColors: ColorValue[];
  postId?: PostId;
  highlightedComments?: CommentId[];
  reloadId: number;
}) {
  const [commentReloadId, setCommentReloadId] = React.useState(0);
  const comment = useComment(commentId, reloadId + commentReloadId);
  const {
    comments,
    loadError: childLoadError,
    loadNextPage,
  } = useComments("comment", commentId, reloadId);
  const [showChildren, setShowChildren] = React.useState(true);
  const theme = useTheme();
  const ctx = useLotideCtx();
  const [selectedComment, setSelectedComment] = useSelectedComment();

  if (!ctx) return null;

  if (!comment) {
    return (
      <RetryState
        compact
        message="Cannot load comment"
        onRetry={() => setCommentReloadId(x => x + 1)}
        style={styles.retry}
      />
    );
  }

  return (
    <View style={{ paddingLeft: 0 }}>
      <View
        style={{
          paddingVertical: 8,
          borderTopWidth: 0.5,
          borderTopColor: theme.secondaryBackground,
        }}
      >
        <Pressable
          accessibilityLabel={
            selectedComment === comment.id
              ? "Hide comment actions"
              : "Show comment actions"
          }
          accessibilityRole="button"
          onPress={() =>
            setSelectedComment(
              selectedComment !== comment.id ? comment.id : undefined,
            )
          }
        >
          <View
            style={{
              borderLeftWidth: 2,
              borderColor: layerColors[layer % layerColors.length],
              paddingLeft: 15,
              paddingVertical: 3,
              backgroundColor: highlightedComments.includes(comment.id)
                ? theme.secondaryBackground
                : theme.background,
            }}
          >
            <View
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                flexWrap: "wrap",
                marginBottom: 5,
              }}
            >
              {comment.author ? (
                <ActorDisplayComponent
                  name={comment.author.username}
                  host={comment.author.host}
                  local={comment.author.local ?? false}
                  showHost="only_foreign"
                  colorize="only_foreign"
                  style={{ fontSize: 16, fontWeight: "500" }}
                  userId={comment.author.id}
                />
              ) : (
                <Text style={{ color: theme.secondaryText }}>
                  Unknown author
                </Text>
              )}
              <View
                style={{
                  marginRight: 15,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Text>{!showChildren && "...    "}</Text>
                <Icon
                  name={comment.your_vote ? "heart" : "heart-outline"}
                  size={14}
                  color={theme.text}
                  light
                />
                <Text>{` ${comment.score}   `}</Text>
                <ElapsedTime time={comment.created} />
              </View>
            </View>
            {showChildren && !!comment.content_html && (
              <ContentDisplay
                contentHtml={comment.content_html}
                contentText={comment.content_text}
              />
            )}
          </View>
          {selectedComment === comment.id && (
            <View style={styles.buttons}>
              <VoteCounter
                type="comment"
                content={comment}
                hideCount
                style={styles.button}
              />
              {/* <Pressable style={styles.button}>
                <Icon color={theme.text} size={20} name="bookmark-outline" />
              </Pressable> */}
              <Pressable
                accessibilityLabel="Reply to comment"
                accessibilityRole="button"
                style={styles.button}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("Comment", {
                    id: comment.id,
                    postId,
                    title: comment.author?.username || "Comment",
                    html: comment.content_html || comment.content_text || "",
                    type: "comment",
                  });
                }}
              >
                <Icon color={theme.text} size={20} name="arrow-undo-outline" />
              </Pressable>
              <Pressable
                accessibilityLabel={
                  showChildren ? "Collapse replies" : "Expand replies"
                }
                accessibilityRole="button"
                style={styles.button}
                onPress={() => {
                  setShowChildren(s => !s);
                }}
              >
                <Icon
                  color={
                    (comment.replies?.items.length || 0) > 0
                      ? theme.text
                      : theme.secondaryText
                  }
                  size={20}
                  name={
                    showChildren ? "chevron-up-outline" : "chevron-down-outline"
                  }
                />
              </Pressable>
              {/* <Pressable style={styles.button}>
                <Icon
                  color={theme.text}
                  size={20}
                  name="ellipsis-vertical-outline"
                />
              </Pressable> */}
            </View>
          )}
        </Pressable>
      </View>
      {comments &&
        comments.items.length > 0 &&
        (showChildren ? (
          <View style={{ paddingLeft: 15 }}>
            <CommentsDisplay
              parentType="comment"
              parentId={commentId}
              layer={layer + 1}
              navigation={navigation}
              postId={postId}
              highlightedComments={highlightedComments}
              reloadId={reloadId}
            />
          </View>
        ) : (
          <Text>...</Text>
        ))}
      {childLoadError ? (
        <RetryState
          compact
          message={childLoadError}
          onRetry={loadNextPage}
          style={styles.nestedRetry}
        />
      ) : comments === undefined ? (
        <Pressable
          accessibilityLabel="Load more replies"
          accessibilityRole="button"
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          onPress={loadNextPage}
          style={styles.moreComments}
        >
          <View style={{ paddingHorizontal: 15 }}>
            <Text style={{ color: theme.tint }}>
              More comments <Icon name="chevron-forward-outline" />
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: MINIMUM_TOUCH_TARGET_SIZE,
    padding: 10,
    paddingHorizontal: 15,
  },
  moreComments: {
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 15,
  },
  retry: {
    padding: 17,
  },
  nestedRetry: {
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
});

/* end of CommentsDisplay.tsx */
