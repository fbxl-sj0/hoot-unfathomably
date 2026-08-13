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
        - Route books and GPS trails into their native mobile workflows

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
import { bookReferenceFromFields } from "../services/UnfathomablyBooksService";
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

function safeHttpField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function coordinate(value: unknown, minimum: number, maximum: number): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : undefined;
}

export default function NativeResourceScreen({ navigation, route }: RootStackScreenProps<"NativeResource">) {
  const theme = useTheme();
  const resource = route.params.resource;
  const latitude = coordinate(resource.fields.latitude, -90, 90);
  const longitude = coordinate(resource.fields.longitude, -180, 180);
  const mapUrl = latitude !== undefined && longitude !== undefined
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`
    : undefined;
  const gpxUrl = safeHttpField(resource.fields.gpx_url);

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
      {resource.family === "books" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Manage ${resource.title} in your book library`}
          onPress={() => navigation.navigate("BookLibrary", {
            book: bookReferenceFromFields(
              resource.canonicalUrl,
              resource.title,
              resource.fields,
              typeof resource.fields.image === "string" ? resource.fields.image : undefined,
            ),
          })}
          style={[styles.workflow, { backgroundColor: theme.secondaryBackground }]}
        >
          <Icon name="library-outline" color={theme.tint} size={22} />
          <Text tint>Manage in My books</Text>
        </Pressable>
      ) : null}
      {resource.family === "routes" ? (
        <View style={styles.routeActions}>
          {mapUrl ? (
            <Pressable accessibilityRole="link" onPress={() => { void openExternalLink(mapUrl); }} style={styles.workflow}>
              <Icon name="map-outline" color={theme.tint} size={22} />
              <Text tint>Open route start</Text>
            </Pressable>
          ) : null}
          {gpxUrl ? (
            <Pressable accessibilityRole="link" onPress={() => { void openExternalLink(gpxUrl); }} style={styles.workflow}>
              <Icon name="download-outline" color={theme.tint} size={22} />
              <Text tint>Open GPX track</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("RouteRecorder")} style={[styles.workflow, { backgroundColor: theme.secondaryBackground }]}>
            <Icon name="navigate-circle-outline" color={theme.tint} size={22} />
            <Text tint>Record another path</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open original ${resource.title}`}
        onPress={() => { void openExternalLink(resource.sourceUrl || resource.canonicalUrl); }}
        style={[styles.open, { backgroundColor: theme.tint }]}
      >
        <Icon name="open-outline" color={theme.onTint} size={21} />
        <Text style={{ color: theme.onTint }}>Open original</Text>
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
  workflow: { alignItems: "center", alignSelf: "flex-start", borderRadius: 9, flexDirection: "row", gap: 8, minHeight: 48, paddingHorizontal: 12 },
  routeActions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
});

/* end of NativeResourceScreen.tsx */
