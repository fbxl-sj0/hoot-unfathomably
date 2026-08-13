/*
    Project: Hoot Unfathomably
    --------------------------

    File: SourceItemCard.tsx

    Purpose:

        Present a source preview item that is not represented by a status.

    Responsibilities:

        - Show a thumbnail and bounded source-owned description
        - Label the source platform and object type
        - Open only explicitly selected public links

    This file intentionally does NOT contain:

        - source relationship controls
        - status rendering
        - remote content fetching
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import type { UnfathomablySourceItem } from "../services/UnfathomablySourcesService";
import { openExternalLink } from "../utils/externalLink";
import { Text, View } from "./Themed";

export default function SourceItemCard({ item }: { item: UnfathomablySourceItem }) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { borderColor: theme.tertiaryBackground }]}>
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} resizeMode="cover" style={styles.image} />
      ) : null}
      <View style={styles.body}>
        <Text tint style={styles.label}>
          {item.platformLabel} · {item.sourceKindLabel}
        </Text>
        <Text style={styles.title}>{item.title}</Text>
        {item.summary ? <Text numberOfLines={5}>{item.summary}</Text> : null}
        {item.url ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${item.title}`}
            onPress={() => { void openExternalLink(item.url || ""); }}
            style={styles.open}
          >
            <Icon name="open-outline" color={theme.tint} size={20} />
            <Text tint>Open original</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 8 },
  image: { height: 170, width: "100%" },
  body: { gap: 7, padding: 15 },
  label: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: "700" },
  open: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 7, minHeight: 48, paddingHorizontal: 5 },
});

/* end of SourceItemCard.tsx */
