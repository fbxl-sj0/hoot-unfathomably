/*
    Project: Hoot Unfathomably
    --------------------------

    File: WorldDiscoveryCard.tsx

    Purpose:

        Present one provider-neutral result returned by Worlds discovery.

    Responsibilities:

        - Show bounded descriptive metadata and a safe thumbnail
        - Distinguish local resolution from opening the original resource
        - Provide phone-sized controls for both actions

    This file intentionally does NOT contain:

        - discovery requests or pagination
        - provider-specific object parsing
        - status-thread navigation policy
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import type { WorldDiscoveryItem } from "../services/UnfathomablyWorldsService";
import { openExternalLink } from "../utils/externalLink";
import { Text, View } from "./Themed";

const VISIBLE_FACT_COUNT = 4;

function factText(value: string | number | boolean | (string | number | boolean)[]): string {
  if (Array.isArray(value)) return value.slice(0, 5).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function factLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function WorldDiscoveryCard({
  item,
  onOpenHere,
  opening = false,
}: {
  item: WorldDiscoveryItem;
  onOpenHere: () => void;
  opening?: boolean;
}) {
  const theme = useTheme();
  const facts = Object.entries(item.fields).slice(0, VISIBLE_FACT_COUNT);

  return (
    <View style={[styles.root, { borderColor: theme.tertiaryBackground }]}>
      {item.imageUrl ? (
        <Image
          accessibilityLabel="Discovery result preview"
          resizeMode="cover"
          source={{ uri: item.imageUrl }}
          style={styles.image}
        />
      ) : null}
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text tint style={styles.family}>{factLabel(item.family)}</Text>
          <Text secondary numberOfLines={1} style={styles.source}>
            {item.sourceHost || factLabel(item.kind)}
          </Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        {item.summary ? (
          <Text numberOfLines={4} style={styles.summary}>{item.summary}</Text>
        ) : null}
        {facts.length > 0 ? (
          <View style={styles.facts}>
            {facts.map(([key, value]) => (
              <View
                key={key}
                style={[styles.fact, { backgroundColor: theme.secondaryBackground }]}
              >
                <Text secondary style={styles.factLabel}>{factLabel(key)}</Text>
                <Text numberOfLines={2}>{factText(value)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title} on this server`}
            disabled={opening}
            onPress={onOpenHere}
            style={[styles.primaryAction, { backgroundColor: theme.tint }]}
          >
            <Icon name="enter-outline" color={theme.background} size={20} />
            <Text style={{ color: theme.background }}>
              {opening ? "Opening..." : "Open here"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open original ${item.title}`}
            onPress={() => { void openExternalLink(item.url); }}
            style={styles.secondaryAction}
          >
            <Icon name="open-outline" color={theme.tint} size={20} />
            <Text tint>Original</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 8 },
  image: { height: 190, width: "100%" },
  body: { gap: 8, padding: 15 },
  labelRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  family: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  source: { flex: 1, fontSize: 12, textAlign: "right" },
  title: { fontSize: 19, fontWeight: "700" },
  summary: { fontSize: 15, lineHeight: 21 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fact: { borderRadius: 7, flexBasis: 140, flexGrow: 1, gap: 2, padding: 8 },
  factLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  primaryAction: { alignItems: "center", borderRadius: 9, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  secondaryAction: { alignItems: "center", flexDirection: "row", gap: 7, minHeight: 48, paddingHorizontal: 8 },
});

/* end of WorldDiscoveryCard.tsx */
