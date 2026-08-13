/*
    Project: Hoot Unfathomably
    --------------------------

    File: SourceCard.tsx

    Purpose:

        Present one Unfathomably feed or source identity.

    Responsibilities:

        - Identify the source platform and source kind
        - Expose explicit preview and follow controls
        - Keep controls large enough for touch interaction

    This file intentionally does NOT contain:

        - source network requests
        - timeline rendering
        - RSS or ActivityPub parsing
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import type { UnfathomablySource } from "../services/UnfathomablySourcesService";
import { Text, View } from "./Themed";

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function SourceCard({
  source,
  onOpen,
  onToggleFollow,
  saving = false,
}: {
  source: UnfathomablySource;
  onOpen: () => void;
  onToggleFollow: () => void;
  saving?: boolean;
}) {
  const theme = useTheme();
  const followed = source.relationship?.following === true;

  return (
    <View style={[styles.root, { borderColor: theme.tertiaryBackground }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${source.display_name}`}
        onPress={onOpen}
        style={styles.identity}
      >
        {source.avatar ? (
          <Image source={{ uri: source.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.placeholder, { backgroundColor: theme.secondaryBackground }]}>
            <Icon name="newspaper-outline" color={theme.tint} size={27} />
          </View>
        )}
        <View style={styles.details}>
          <Text numberOfLines={2} style={styles.title}>{source.display_name}</Text>
          <Text secondary numberOfLines={1}>
            {source.platform_label} · {source.source_kind_label}
          </Text>
          {source.note ? (
            <Text numberOfLines={2} style={styles.note}>{plainText(source.note)}</Text>
          ) : null}
        </View>
        <Icon name="chevron-forward-outline" color={theme.secondaryText} size={22} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={followed ? `Unfollow ${source.display_name}` : `Follow ${source.display_name}`}
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        onPress={onToggleFollow}
        style={[
          styles.follow,
          {
            backgroundColor: followed ? theme.secondaryBackground : theme.tint,
            borderColor: followed ? theme.tertiaryBackground : theme.tint,
          },
        ]}
      >
        <Icon
          name={followed ? "checkmark-outline" : "add-outline"}
          color={followed ? theme.text : theme.background}
          size={21}
        />
        <Text style={{ color: followed ? theme.text : theme.background }}>
          {saving ? "Saving..." : followed ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 1, gap: 8, padding: 14 },
  identity: { alignItems: "center", flexDirection: "row", gap: 11, minHeight: 58 },
  avatar: { borderRadius: 26, height: 52, width: 52 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  details: { flex: 1, gap: 3 },
  title: { fontSize: 17, fontWeight: "700" },
  note: { fontSize: 14, lineHeight: 19 },
  follow: { alignItems: "center", alignSelf: "flex-start", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, minWidth: 126, paddingHorizontal: 16 },
});

/* end of SourceCard.tsx */
