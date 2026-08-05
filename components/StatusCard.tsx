/*
    Project: Hoot Mobile
    --------------------------

    File: StatusCard.tsx

    Purpose:

        Render a Mastodon-compatible status using Hoot's compact card style.
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { Alert, Image, Pressable, StyleSheet } from "react-native";

import { Text, View } from "./Themed";
import StatusLinkPreview from "./StatusLinkPreview";
import useTheme from "../hooks/useTheme";
import * as Unfathomably from "../services/UnfathomablyService";
import {
  ComposeIntent,
  createComposeIntent,
} from "../utils/composeIntent";
import { getErrorMessage } from "../utils/error";

export default function StatusCard({
  status,
  ctx,
  navigation,
  compact = false,
}: {
  status: Unfathomably.UnfathomablyStatus;
  ctx: LotideContext;
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void };
  compact?: boolean;
}) {
  const theme = useTheme();
  const [current, setCurrent] = useState(status);
  const visible = current.reblog || current;
  const account = visible.account;
  const group = visible.group || current.group;
  const replyAccount = getReplyAccount(visible);
  const replyRecipientCount = getOtherReplyRecipientCount(
    visible,
    replyAccount,
  );
  const displayContent = getStatusDisplayContent(visible);
  const displayedMedia = compact
    ? visible.media_attachments.slice(0, 1)
    : visible.media_attachments;
  const capabilities = Unfathomably.getStatusCapabilities(visible);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);

  async function toggleReblog() {
    try {
      const next = await Unfathomably.reblogStatus(ctx, visible.id, !!visible.reblogged);
      setCurrent(next);
    } catch (error) {
      Alert.alert("Could not repost", getErrorMessage(error));
    }
  }

  async function toggleFavourite() {
    try {
      const next = await Unfathomably.favouriteStatus(
        ctx,
        visible.id,
        !!visible.favourited,
      );
      setCurrent(next);
    } catch (error) {
      Alert.alert("Could not add thumbs up", getErrorMessage(error));
    }
  }

  async function toggleDislike() {
    try {
      const next = await Unfathomably.dislikeStatus(
        ctx,
        visible.id,
        !!visible.disliked,
      );
      setCurrent(next);
    } catch (error) {
      Alert.alert("Could not add thumbs down", getErrorMessage(error));
    }
  }

  async function reactWithEmoji(emoji: string) {
    const reactions = visible.emoji_reactions || visible.pleroma?.emoji_reactions || [];
    const ownReaction = reactions.some(reaction => reaction.name === emoji && reaction.me);
    try {
      const next = await Unfathomably.reactToStatus(ctx, visible.id, emoji, ownReaction);
      setCurrent(next);
      setEmojiMenuOpen(false);
    } catch (error) {
      Alert.alert("Could not add emoji reaction", getErrorMessage(error));
    }
  }

  const actionPress = (callback: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    callback();
  };
  const openComposer = (
    params: Partial<Omit<ComposeIntent, "composeIntentId">>,
  ) => {
    navigation.navigate("Root", {
      screen: "NewPostScreen",
      params: createComposeIntent(params),
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${account.display_name || account.acct}`}
      onPress={() => navigation.navigate("Status", { statusId: visible.id })}
      style={[styles.card, { borderColor: theme.secondaryBackground }]}
    >
      {current.reblog && (
        <Text style={[styles.boosted, { color: theme.secondaryText }]}>
          <Icon name="repeat-outline" size={13} /> Boosted by {current.account.display_name || current.account.acct}
        </Text>
      )}
      <View style={styles.header}>
        {!!account.avatar && <Image source={{ uri: account.avatar }} style={styles.avatar} />}
        <View style={styles.author}>
          <Text numberOfLines={1} style={styles.displayName}>{account.display_name || account.username}</Text>
          <Text numberOfLines={1} secondary>@{account.acct}</Text>
        </View>
        <Text secondary>{new Date(visible.created_at).toLocaleDateString()}</Text>
      </View>
      {!!visible.in_reply_to_id && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            replyAccount
              ? `Open post this replies to by @${replyAccount}`
              : "Open post this replies to"
          }
          onPress={event => {
            event.stopPropagation();
            navigation.navigate("Status", {
              statusId: visible.in_reply_to_id,
            });
          }}
          style={styles.replyContext}
        >
          <Icon name="arrow-undo-outline" size={16} color={theme.secondaryText} />
          <Text secondary numberOfLines={1} style={styles.replyContextText}>
            {replyAccount
              ? `Replying to @${replyAccount}${replyRecipientCount > 0 ? ` +${replyRecipientCount}` : ""}`
              : "Reply in conversation"}
          </Text>
        </Pressable>
      )}
      {!!group && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open group ${group.display_name}`}
          onPress={event => {
            event.stopPropagation();
            navigation.navigate("Group", { groupId: group.id, title: group.display_name });
          }}
          style={[styles.group, { backgroundColor: theme.secondaryBackground }]}
        >
          <Icon name="people-outline" size={15} color={theme.tint} />
          <Text style={{ color: theme.tint }}>{group.display_name}</Text>
        </Pressable>
      )}
      {!!visible.spoiler_text && <Text style={styles.spoiler}>{visible.spoiler_text}</Text>}
      {!!displayContent && (
        <Text selectable style={styles.content}>{displayContent}</Text>
      )}
      {displayedMedia.map(media => (
        <Pressable key={media.id} accessibilityRole="button" accessibilityLabel="Open image full screen" onPress={event => { event.stopPropagation(); navigation.navigate("ImageViewer", { uri: media.url || media.preview_url || "", fallbackUri: media.preview_url, description: media.description }); }}>
          <Image source={{ uri: media.preview_url || media.url }} resizeMode="contain" style={[styles.media, compact && styles.compactMedia, { backgroundColor: theme.secondaryBackground }]} />
        </Pressable>
      ))}
      {compact && visible.media_attachments.length > displayedMedia.length && (
        <Text secondary style={styles.moreMedia}>
          +{visible.media_attachments.length - displayedMedia.length} more attachment{visible.media_attachments.length - displayedMedia.length === 1 ? "" : "s"}
        </Text>
      )}
      {!compact && (
        <StatusLinkPreview card={visible.card} content={visible.content} />
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reply to post"
          onPress={actionPress(() => openComposer({ inReplyToId: visible.id, groupId: group?.id, groupName: group?.display_name }))}
          style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
        >
          <Text style={styles.actionText}><Icon name="arrow-undo-outline" size={22} /> {visible.replies_count || ""}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible.reblogged ? "Undo repost" : "Repost"}
          onPress={actionPress(() => { void toggleReblog(); })}
          style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
        >
          <Text style={[styles.actionText, { color: visible.reblogged ? theme.tint : theme.text }]}><Icon name="repeat-outline" size={22} /> {visible.reblogs_count || ""}</Text>
        </Pressable>
        {capabilities.quote && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quote repost"
            onPress={actionPress(() => openComposer({ quoteId: visible.id, groupId: group?.id, groupName: group?.display_name }))}
            style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
          >
            <Text style={styles.actionText}><Icon name="chatbox-ellipses-outline" size={22} /></Text>
          </Pressable>
        )}
        {capabilities.emojiReactions && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose an emoji reaction"
            onPress={actionPress(() => setEmojiMenuOpen(open => !open))}
            style={[styles.action, emojiMenuOpen && { backgroundColor: theme.tint }]}
          >
            <Text style={[styles.actionText, emojiMenuOpen && { color: theme.background }]}><Icon name="happy-outline" size={23} /></Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible.favourited ? "Remove thumbs up" : "React with thumbs up"}
          onPress={actionPress(() => { void toggleFavourite(); })}
          style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
        >
          <Text style={[styles.actionText, { color: visible.favourited ? theme.tint : theme.text }]}><Icon name="thumbs-up-outline" size={22} /> {visible.favourites_count || ""}</Text>
        </Pressable>
        {capabilities.dislike && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible.disliked ? "Remove thumbs down" : "React with thumbs down"}
            onPress={actionPress(() => { void toggleDislike(); })}
            style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
          >
            <Text style={[styles.actionText, { color: visible.disliked ? theme.tint : theme.text }]}><Icon name="thumbs-down-outline" size={22} /> {visible.dislikes_count || ""}</Text>
          </Pressable>
        )}
        {capabilities.emojiReactions && emojiMenuOpen && (
          <View style={[styles.emojiMenu, { backgroundColor: theme.secondaryBackground }]}>
            {["❤️", "😂", "😮", "😢", "🔥", "🎉"].map(emoji => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                onPress={actionPress(() => { void reactWithEmoji(emoji); })}
                style={styles.emojiChoice}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  ).trim();
}

export function getStatusDisplayContent(
  status: Unfathomably.UnfathomablyStatus,
): string {
  let content = stripHtml(status.content);

  if (status.in_reply_to_id) {
    content = collapseLeadingReplyRecipients(content);
  }

  return removeTrailingAttachmentLabels(content, status.media_attachments);
}

export function collapseLeadingReplyRecipients(content: string): string {
  const leadingRecipients = content.match(/^(?:@\S+(?:\s+|$))+/u)?.[0];
  if (!leadingRecipients) return content;

  const remaining = content.slice(leadingRecipients.length).trimStart();
  return remaining || content;
}

export function getOtherReplyRecipientCount(
  status: Unfathomably.UnfathomablyStatus,
  replyAccount = getReplyAccount(status),
): number {
  const normalizedReplyAccount = normalizeAccount(replyAccount);
  const recipients = new Set(
    (status.mentions || [])
      .filter(mention =>
        mention.id !== status.in_reply_to_account_id &&
        normalizeAccount(mention.acct) !== normalizedReplyAccount,
      )
      .map(mention => normalizeAccount(mention.acct) || mention.id)
      .filter(Boolean),
  );

  return recipients.size;
}

export function getReplyAccount(
  status: Unfathomably.UnfathomablyStatus,
): string | undefined {
  const pleromaAccount = status.pleroma?.in_reply_to_account_acct?.trim();
  if (pleromaAccount) return pleromaAccount.replace(/^@/, "");

  const mentionedAccount = status.mentions?.find(
    mention => mention.id === status.in_reply_to_account_id,
  )?.acct.trim();
  return mentionedAccount?.replace(/^@/, "") || undefined;
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized in namedEntities) return namedEntities[normalized];

    const radix = normalized.startsWith("#x") ? 16 : 10;
    const numericToken = normalized.slice(radix === 16 ? 2 : 1);
    const codePoint = Number.parseInt(numericToken, radix);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return entity;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

function removeTrailingAttachmentLabels(
  content: string,
  attachments: Unfathomably.UnfathomablyMediaAttachment[],
): string {
  const fileNames = new Set(
    attachments.flatMap(attachment => {
      const description = attachment.description?.trim();
      return description && isFileName(description)
        ? [description.toLowerCase()]
        : [];
    }),
  );
  const lines = content.split("\n");

  while (
    lines.length > 0 &&
    fileNames.has((lines.at(-1) || "").trim().toLowerCase())
  ) {
    lines.pop();
  }

  return lines.join("\n").trim();
}

function isFileName(value: string): boolean {
  return /\.[a-z0-9]{2,8}$/i.test(value);
}

function normalizeAccount(value?: string): string {
  return value?.trim().replace(/^@/, "").toLowerCase() || "";
}

const styles = StyleSheet.create({
  card: { borderBottomWidth: 8, padding: 15 },
  boosted: { fontSize: 12, marginBottom: 8, marginLeft: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: { height: 40, width: 40, borderRadius: 20 },
  author: { flex: 1 },
  displayName: { fontWeight: "700", fontSize: 16 },
  replyContext: { alignItems: "center", flexDirection: "row", gap: 5, marginLeft: 49, marginTop: 7 },
  replyContextText: { flex: 1, fontSize: 13 },
  group: { alignSelf: "flex-start", flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, marginTop: 12 },
  spoiler: { fontWeight: "700", marginTop: 12 },
  content: { fontSize: 16, lineHeight: 22, marginTop: 12 },
  media: { height: 220, marginTop: 12, borderRadius: 10, width: "100%" },
  compactMedia: { height: 150 },
  moreMedia: { fontSize: 12, marginTop: 6, textAlign: "right" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  action: { alignItems: "center", borderRadius: 10, justifyContent: "center", minHeight: 52, minWidth: 50, paddingHorizontal: 4, width: "15%" },
  actionText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  emojiMenu: { borderRadius: 10, flexDirection: "row", gap: 4, justifyContent: "space-around", padding: 6, width: "100%" },
  emojiChoice: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 42 },
  emojiText: { fontSize: 24 },
});

/* end of StatusCard.tsx */
