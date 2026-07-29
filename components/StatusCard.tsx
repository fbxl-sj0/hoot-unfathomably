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
import useTheme from "../hooks/useTheme";
import * as Unfathomably from "../services/UnfathomablyService";
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
  const openComposer = (params: Record<string, unknown>) => {
    navigation.navigate("Root", {
      screen: "NewPostScreen",
      params,
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
      <Text selectable style={styles.content}>{stripHtml(visible.content)}</Text>
      {!compact && visible.media_attachments.map(media => (
        <Pressable key={media.id} accessibilityRole="button" accessibilityLabel="Open image full screen" onPress={event => { event.stopPropagation(); navigation.navigate("ImageViewer", { uri: media.url || media.preview_url || "", fallbackUri: media.preview_url, description: media.description }); }}>
          <Image source={{ uri: media.preview_url || media.url }} resizeMode="contain" style={[styles.media, { backgroundColor: theme.secondaryBackground }]} />
        </Pressable>
      ))}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quote repost"
          onPress={actionPress(() => openComposer({ quoteId: visible.id, groupId: group?.id, groupName: group?.display_name }))}
          style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
        >
          <Text style={styles.actionText}><Icon name="chatbox-ellipses-outline" size={22} /></Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose an emoji reaction"
          onPress={actionPress(() => setEmojiMenuOpen(open => !open))}
          style={[styles.action, emojiMenuOpen && { backgroundColor: theme.tint }]}
        >
          <Text style={[styles.actionText, emojiMenuOpen && { color: theme.background }]}><Icon name="happy-outline" size={23} /></Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible.favourited ? "Remove thumbs up" : "React with thumbs up"}
          onPress={actionPress(() => { void toggleFavourite(); })}
          style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
        >
          <Text style={[styles.actionText, { color: visible.favourited ? theme.tint : theme.text }]}><Icon name="thumbs-up-outline" size={22} /> {visible.favourites_count || ""}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible.disliked ? "Remove thumbs down" : "React with thumbs down"}
          onPress={actionPress(() => { void toggleDislike(); })}
          style={[styles.action, { backgroundColor: theme.secondaryBackground }]}
        >
          <Text style={[styles.actionText, { color: visible.disliked ? theme.tint : theme.text }]}><Icon name="thumbs-down-outline" size={22} /> {visible.dislikes_count || ""}</Text>
        </Pressable>
        {emojiMenuOpen && (
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

const styles = StyleSheet.create({
  card: { borderBottomWidth: 8, padding: 15 },
  boosted: { fontSize: 12, marginBottom: 8, marginLeft: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: { height: 40, width: 40, borderRadius: 20 },
  author: { flex: 1 },
  displayName: { fontWeight: "700", fontSize: 16 },
  group: { alignSelf: "flex-start", flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, marginTop: 12 },
  spoiler: { fontWeight: "700", marginTop: 12 },
  content: { fontSize: 16, lineHeight: 22, marginTop: 12 },
  media: { height: 220, marginTop: 12, borderRadius: 10, width: "100%" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  action: { alignItems: "center", borderRadius: 10, justifyContent: "center", minHeight: 52, minWidth: 50, paddingHorizontal: 4, width: "15%" },
  actionText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  emojiMenu: { borderRadius: 10, flexDirection: "row", gap: 4, justifyContent: "space-around", padding: 6, width: "100%" },
  emojiChoice: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 42 },
  emojiText: { fontSize: 24 },
});

/* end of StatusCard.tsx */
