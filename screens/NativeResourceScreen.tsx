/*
    Project: Hoot Unfathomably
    --------------------------

    File: NativeResourceScreen.tsx

    Purpose:

        Display a resolved native object that has no local status wrapper.

    Responsibilities:

        - Present normalized object facts without fetching remote content
        - Identify the source platform and source host
        - Preserve an explicit link to the authoritative object

    This file intentionally does NOT contain:

        - provider embeds or remote scripts
        - status actions
        - native-object lifecycle mutations
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";

import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import type { RootStackScreenProps } from "../types";
import { openExternalLink } from "../utils/externalLink";

function label(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function valueText(value: string | number | boolean | (string | number | boolean)[]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function NativeResourceScreen({ route }: RootStackScreenProps<"NativeResource">) {
  const theme = useTheme();
  const resource = route.params.resource;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Icon name="planet-outline" color={theme.tint} size={34} />
        <View style={styles.identityText}>
          <Text tint style={styles.family}>{label(resource.family)}</Text>
          <Text style={styles.title}>{resource.title}</Text>
          <Text secondary>{resource.platform} · {resource.sourceHost}</Text>
        </View>
      </View>
      {resource.summary ? <Text style={styles.summary}>{resource.summary}</Text> : null}
      <View style={styles.facts}>
        {Object.entries(resource.fields).map(([key, value]) => (
          <View key={key} style={[styles.fact, { backgroundColor: theme.secondaryBackground }]}>
            <Text secondary style={styles.factLabel}>{label(key)}</Text>
            <Text selectable>{valueText(value)}</Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open original ${resource.title}`}
        onPress={() => { void openExternalLink(resource.sourceUrl || resource.canonicalUrl); }}
        style={[styles.open, { backgroundColor: theme.tint }]}
      >
        <Icon name="open-outline" color={theme.background} size={21} />
        <Text style={{ color: theme.background }}>Open original</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 16, padding: 17 },
  identity: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  identityText: { flex: 1, gap: 4 },
  family: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 24, fontWeight: "700" },
  summary: { fontSize: 16, lineHeight: 23 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  fact: { borderRadius: 9, flexBasis: 150, flexGrow: 1, gap: 3, padding: 11 },
  factLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  open: { alignItems: "center", alignSelf: "flex-start", borderRadius: 9, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50, paddingHorizontal: 17 },
});

/* end of NativeResourceScreen.tsx */
