/*
    Project: Hoot Mobile
    -------------------

    File: SourceItemScreen.tsx

    Purpose:

        Render a cached Lotide source-feed item in the mobile app.

    Responsibilities:

        - Load a source item and its cached comments
        - Render cached body, summary, image, and original URL
        - Apply or remove likes when the source supports Like activities
        - Submit comments when the backend reports a compatible reply path

    This file intentionally does NOT contain:

        - Source-feed list filtering
        - Private message logic
        - WebView rendering of remote pages
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { ActorDisplay } from "../components/ActorDisplay";
import ContentDisplay from "../components/ContentDisplay";
import ElapsedTime from "../components/ElapsedTime";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import { supportsCollectionTargets } from "../constants/LotideApi";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useTheme from "../hooks/useTheme";
import * as Haptics from "../services/HapticService";
import * as LotideService from "../services/LotideService";
import { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";
import { openExternalLink } from "../utils/externalLink";

export default function SourceItemScreen({
  route,
}: RootStackScreenProps<"CollectionTargetItem">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const collectionTargetId = parseFiniteNumber(route.params?.collectionTargetId);
  const itemId = parseFiniteNumber(route.params?.itemId);
  const [sourceItem, setSourceItem] = useState<CollectionTargetItem>();
  const [loadError, setLoadError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const canUseSources = supportsCollectionTargets(ctx?.apiVersion);

  useEffect(() => {
    if (!ctx?.apiUrl || !canUseSources || !collectionTargetId || !itemId) {
      return;
    }

    let isActive = true;

    LotideService.getCollectionTargetItem(ctx, collectionTargetId, itemId)
      .then(data => {
        if (!isActive) return;
        setSourceItem(data);
        setLoadError("");
        setHasLoaded(true);
      })
      .catch(() => {
        if (!isActive) return;
        setLoadError("Cannot load source item");
        setHasLoaded(true);
      })
      .finally(() => {
        if (!isActive) return;
        setIsRefreshing(false);
      });

    return () => {
      isActive = false;
    };
  }, [canUseSources, collectionTargetId, ctx, itemId, reloadId]);

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

  if (!collectionTargetId || !itemId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>Cannot load source item</Text>
      </View>
    );
  }

  function refresh() {
    setLoadError("");
    if (!sourceItem) setHasLoaded(false);
    setReloadId(x => x + 1);
  }

  function refreshFromGesture() {
    setLoadError("");
    setIsRefreshing(true);
    setReloadId(x => x + 1);
  }

  if (!sourceItem && loadError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <RetryState message={loadError} onRetry={refresh} />
      </View>
    );
  }

  if (!sourceItem) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>
          {!hasLoaded ? "Loading source item" : "Cannot load source item"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="source-item-scroll"
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refreshFromGesture} />
      }
    >
      {loadError ? (
        <RetryState
          compact
          message={loadError}
          onRetry={refresh}
          style={styles.inlineRetry}
        />
      ) : null}
      <SourceItemBody
        sourceItem={sourceItem}
        collectionTargetId={collectionTargetId}
        itemId={itemId}
        onCommentAccepted={comment =>
          setSourceItem(item =>
            item ? upsertSourceItemComment(item, comment) : item,
          )
        }
        onChanged={refresh}
      />
    </ScrollView>
  );
}

function SourceItemBody({
  sourceItem,
  collectionTargetId,
  itemId,
  onCommentAccepted,
  onChanged,
}: {
  sourceItem: CollectionTargetItem;
  collectionTargetId: CollectionTargetId;
  itemId: CollectionTargetItemId;
  onCommentAccepted: (comment: CollectionTargetItemComment) => void;
  onChanged: () => void;
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const navigation =
    useNavigation<RootStackScreenProps<"CollectionTargetItem">["navigation"]>();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const isVotingRef = useRef(false);
  const { collection, item, comments } = sourceItem;
  const sourceHref = item.url || item.ap_id;
  const hasCachedBody = !!item.content_html || !!item.summary_html;
  const canVote =
    !!ctx?.login && collection.preview_item_likes_supported && !isVoting;
  const canReply = !!ctx?.login && collection.can_reply;
  const voteColor = item.your_vote ? theme.red : theme.secondaryText;
  const voteLabel = collection.preview_item_likes_supported
    ? isVoting
      ? item.your_vote
        ? "Removing like..."
        : "Liking..."
      : item.your_vote
        ? "Liked"
        : "Like"
    : "Likes unavailable";
  const trimmedCommentText = commentText.trim();

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      isSubmittingRef.current = false;
      isVotingRef.current = false;
    };
  }, []);

  function toggleVote() {
    if (
      !ctx?.login ||
      !collection.preview_item_likes_supported ||
      isVotingRef.current
    ) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isVotingRef.current = true;
    setIsVoting(true);

    const action = item.your_vote
      ? LotideService.removeCollectionTargetItemVote(
          ctx,
          collectionTargetId,
          itemId,
        )
      : LotideService.applyCollectionTargetItemVote(
          ctx,
          collectionTargetId,
          itemId,
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

  function submitComment() {
    if (!ctx?.login || !trimmedCommentText || isSubmittingRef.current) return;

    const login = ctx.login;
    const content = trimmedCommentText;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    LotideService.commentOnCollectionTargetItem(
      ctx,
      collectionTargetId,
      itemId,
      content,
    )
      .then(result => {
        if (!isMountedRef.current) return;

        onCommentAccepted(
          buildAcceptedSourceItemComment(
            result.id,
            content,
            login.user,
          ),
        );
        setCommentText("");
        onChanged();
      })
      .catch(error => {
        if (!isMountedRef.current) return;

        Alert.alert("Could not submit comment", getErrorMessage(error));
      })
      .finally(() => {
        if (isMountedRef.current) {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
        }
      });
  }

  return (
    <>
      <Pressable
        accessibilityLabel={`Back to ${collection.name}`}
        accessibilityRole="button"
        hitSlop={TOUCH_TARGET_HIT_SLOP}
        onPress={() =>
          navigation.navigate("CollectionTarget", {
            id: collectionTargetId,
            source: collection,
          })
        }
      >
        <Text style={{ color: theme.secondaryTint }}>{collection.name}</Text>
      </Pressable>
      <Text style={[styles.title, { color: theme.text }]}>{item.name}</Text>
      <Text style={{ color: theme.secondaryText }}>
        {[item.type, item.published].filter(Boolean).join(" · ")}
      </Text>
      <Pressable
        accessibilityLabel="Open original source item"
        accessibilityRole="link"
        hitSlop={TOUCH_TARGET_HIT_SLOP}
        onPress={() => openExternal(sourceHref)}
        style={styles.externalLink}
      >
        <Text style={{ color: theme.secondaryTint }}>{sourceHref}</Text>
      </Pressable>
      {!!item.image_url && (
        <Pressable
          accessibilityLabel="Open source item image"
          accessibilityRole="imagebutton"
          onPress={() => openExternal(item.image_url || "")}
          style={styles.imageWrap}
        >
          <Image
            source={{ uri: item.image_url }}
            resizeMode="cover"
            style={styles.image}
          />
        </Pressable>
      )}
      <View style={styles.body}>
        {item.content_html ? (
          <ContentDisplay contentHtml={item.content_html} />
        ) : item.summary_html ? (
          <ContentDisplay contentHtml={item.summary_html} />
        ) : (
          <Text style={{ color: theme.secondaryText }}>
            No cached body is available for this feed item yet.
          </Text>
        )}
      </View>
      {!!ctx?.login && (
        <Pressable
          accessibilityLabel={
            item.your_vote ? "Remove source item like" : "Like source item"
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !canVote }}
          disabled={!canVote}
          onPress={toggleVote}
          style={[
            styles.voteRow,
            isVoting && styles.disabledButton,
            { backgroundColor: theme.secondaryBackground },
          ]}
        >
          <Icon
            name={item.your_vote ? "heart" : "heart-outline"}
            size={24}
            color={
              collection.preview_item_likes_supported || item.your_vote
                ? voteColor
                : theme.tertiaryBackground
            }
          />
          <Text style={{ color: theme.text }}>{voteLabel}</Text>
        </Pressable>
      )}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Comments</Text>
      {comments.length === 0 ? (
        <Text style={{ color: theme.secondaryText }}>
          No comments are cached for this feed item yet.
        </Text>
      ) : (
        comments.map(comment => (
          <SourceItemComment key={comment.id} comment={comment} />
        ))
      )}
      {canReply ? (
        <View style={styles.commentForm}>
          <TextInput
            accessibilityLabel="Comment"
            multiline
            placeholder="Write a comment"
            placeholderTextColor={theme.placeholderText}
            value={commentText}
            onChangeText={setCommentText}
            style={[
              styles.commentInput,
              {
                borderColor: theme.tertiaryBackground,
                color: theme.text,
              },
            ]}
          />
          <Pressable
            accessibilityLabel="Send comment"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting || !trimmedCommentText }}
            disabled={isSubmitting || !trimmedCommentText}
            onPress={submitComment}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  isSubmitting || !trimmedCommentText
                    ? theme.tertiaryBackground
                    : theme.tint,
              },
            ]}
          >
            <Text style={{ color: "#111827", fontWeight: "600" }}>
              {isSubmitting ? "Sending..." : "Send"}
            </Text>
          </Pressable>
        </View>
      ) : (
        !!ctx?.login && (
          <Text style={{ color: theme.secondaryText, marginTop: 16 }}>
            {collection.preview_item_replies_supported
              ? "The feed owner inbox is not known yet, so replies are disabled for now."
              : "This feed type does not expose a compatible reply path."}
          </Text>
        )
      )}
      {!hasCachedBody && (
        <Text style={{ color: theme.secondaryText, marginTop: 16 }}>
          Open the original source item for the full remote page.
        </Text>
      )}
    </>
  );
}

function SourceItemComment({ comment }: { comment: CollectionTargetItemComment }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.comment,
        {
          borderColor: theme.secondaryBackground,
        },
      ]}
    >
      <View style={styles.commentMeta}>
        {comment.author ? (
          <ActorDisplay
            name={comment.author.username}
            host={comment.author.host}
            local={comment.author.local ?? false}
            showHost="only_foreign"
            colorize="only_foreign"
            userId={comment.author.id}
          />
        ) : (
          <Text style={{ color: theme.secondaryText }}>Unknown author</Text>
        )}
        <ElapsedTime time={comment.created} />
      </View>
      <ContentDisplay
        contentHtml={comment.content_html}
        contentMarkdown={comment.content_markdown}
        contentText={comment.content_text}
      />
    </View>
  );
}

function parseFiniteNumber(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildAcceptedSourceItemComment(
  id: CommentId,
  content: string,
  author?: Profile,
): CollectionTargetItemComment {
  return {
    id,
    content_markdown: content,
    content_text: content,
    content_html: null,
    created: new Date().toISOString(),
    local: true,
    author,
    sensitive: false,
  };
}

function upsertSourceItemComment(
  sourceItem: CollectionTargetItem,
  comment: CollectionTargetItemComment,
): CollectionTargetItem {
  const index = sourceItem.comments.findIndex(item => item.id === comment.id);
  const comments =
    index < 0
      ? [...sourceItem.comments, comment]
      : [
          ...sourceItem.comments.slice(0, index),
          comment,
          ...sourceItem.comments.slice(index + 1),
        ];

  return {
    ...sourceItem,
    comments,
  };
}

function openExternal(url: string) {
  void openExternalLink(url);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  externalLink: {
    justifyContent: "center",
    marginTop: 12,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
  },
  imageWrap: {
    borderRadius: 8,
    marginTop: 16,
    overflow: "hidden",
  },
  image: {
    aspectRatio: 16 / 9,
    width: "100%",
  },
  body: {
    marginTop: 16,
  },
  voteRow: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 24,
  },
  comment: {
    borderTopWidth: StyleSheet.hairlineWidth || 1,
    paddingVertical: 14,
  },
  commentMeta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  commentForm: {
    marginTop: 16,
  },
  inlineRetry: {
    marginBottom: 16,
  },
  commentInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth || 1,
    minHeight: 110,
    padding: 12,
    textAlignVertical: "top",
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 10,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
  },
});

/* end of SourceItemScreen.tsx */
