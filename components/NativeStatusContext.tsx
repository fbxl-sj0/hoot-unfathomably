/*
    Project: Hoot Unfathomably
    --------------------------

    File: NativeStatusContext.tsx

    Purpose:

        Present the structured context attached to a native federated status.

    Responsibilities:

        - Label specialized objects with familiar Worlds terminology
        - Show a bounded set of server-approved facts
        - Preserve an explicit route to the authoritative resource
        - Identify selective bridge provenance without inferring capabilities
        - Route book and GPS objects into their mobile workflows

    This file intentionally does NOT contain:

        - ActivityPub classification logic
        - native-object mutation requests
        - visibility or moderation decisions
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { getWorldDefinition, isWorldFamily } from "../constants/Worlds";
import useTheme from "../hooks/useTheme";
import { bookReferenceFromFields } from "../services/UnfathomablyBooksService";
import type {
  UnfathomablyNativeFieldValue,
  UnfathomablyStatus,
} from "../services/UnfathomablyService";
import { openExternalLink } from "../utils/externalLink";
import { Text, View } from "./Themed";

const INITIAL_FACT_COUNT = 4;
const MAX_FACT_COUNT = 10;

const factLabels: Record<string, string> = {
  album: "Album",
  artist: "Artist",
  author: "Author",
  availability: "Availability",
  byline: "Byline",
  category: "Category",
  condition: "Condition",
  creator: "Creator",
  difficulty: "Difficulty",
  distance: "Distance",
  duration: "Duration",
  edition: "Edition",
  elevation_gain: "Elevation gain",
  elevation_loss: "Elevation loss",
  expires: "Expires",
  file_format: "Format",
  file_name: "File",
  game: "Game",
  genres: "Genres",
  language: "Language",
  license: "License",
  listing_name: "Listing",
  location: "Location",
  platform: "Platform",
  price: "Price",
  project_status: "Project status",
  provider: "Provider",
  published_at: "Published",
  purpose: "Purpose",
  quantity: "Quantity",
  rating: "Rating",
  reading_status: "Reading status",
  release_date: "Released",
  release_year: "Year",
  repository: "Repository",
  route_kind: "Route type",
  start_time: "Starts",
  state: "State",
  subtitle: "Subtitle",
  tags: "Tags",
  title: "Title",
  topics: "Topics",
  version: "Version",
  work: "Work",
};

const ignoredFields = new Set([
  "family",
  "kind",
  "latitude",
  "longitude",
  "reference",
  "resource_url",
  "gpx_url",
  "homepage",
  "embed_url",
]);

type NativeFact = {
  key: string;
  label: string;
  value: string;
};

function humanize(value: string): string {
  return value
    .replace(/^https?:\/\/[^#]+#/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function fieldText(value: UnfathomablyNativeFieldValue): string {
  if (Array.isArray(value)) return value.slice(0, 8).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat().format(value);
  }
  return String(value).trim().slice(0, 500);
}

function nativeFacts(
  fields: Record<string, UnfathomablyNativeFieldValue>,
): NativeFact[] {
  return Object.entries(fields)
    .filter(([key]) => !ignoredFields.has(key))
    .flatMap(([key, value]) => {
      const text = fieldText(value);
      if (!text) return [];
      return [{
        key,
        label: factLabels[key] || humanize(key),
        value: text,
      }];
    })
    .slice(0, MAX_FACT_COUNT);
}

function shortType(value: string): string {
  return value.replace(/^https?:\/\/[^#]+#/i, "").split(/[\/:#]/).at(-1) || value;
}

function bridgeLabel(status: UnfathomablyStatus): string | undefined {
  if (status.pleroma?.nostr) return "Nostr";
  if (status.pleroma?.atproto) return "AT Protocol";
  if (status.pleroma?.diaspora) return "diaspora*";
  return undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export default function NativeStatusContext({
  navigation,
  status,
}: {
  navigation?: { navigate: (screen: string, params?: Record<string, unknown>) => void };
  status: UnfathomablyStatus;
}) {
  const theme = useTheme();
  const presentation = status.pleroma?.native;
  const [expanded, setExpanded] = useState(false);
  const facts = useMemo(
    () => nativeFacts(presentation?.fields || {}),
    [presentation?.fields],
  );

  if (!presentation) return null;

  const familyValue = presentation.fields.family;
  const family = typeof familyValue === "string" && isWorldFamily(familyValue)
    ? familyValue
    : undefined;
  const familyTitle = family
    ? getWorldDefinition(family)?.title
    : undefined;
  const typeLabel = shortType(presentation.type);
  const title = familyTitle || humanize(typeLabel);
  const bridge = bridgeLabel(status);
  const visibleFacts = expanded ? facts : facts.slice(0, INITIAL_FACT_COUNT);
  const canExpand = facts.length > INITIAL_FACT_COUNT;
  const canonicalUrl = safeHttpUrl(presentation.canonical_id);
  const bookReferenceValue = family === "books" && navigation
    ? ["catalog_item", "in_reply_to_book", "book", "edition", "work"]
      .map(key => presentation.fields[key])
      .map(safeHttpUrl)
      .find(Boolean) || canonicalUrl
    : undefined;
  const bookReference = typeof bookReferenceValue === "string"
    ? bookReferenceValue
    : undefined;
  const latitudeValue = presentation.fields.latitude;
  const longitudeValue = presentation.fields.longitude;
  const latitude = typeof latitudeValue === "number" ? latitudeValue : Number(latitudeValue);
  const longitude = typeof longitudeValue === "number" ? longitudeValue : Number(longitudeValue);
  const mapUrl = family === "routes" &&
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`
    : undefined;
  const gpxUrl = safeHttpUrl(presentation.fields.gpx_url);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.secondaryBackground,
          borderColor: theme.tertiaryBackground,
        },
      ]}
    >
      <View style={[styles.header, { backgroundColor: theme.secondaryBackground }]}>
        <View style={[styles.titleRow, { backgroundColor: theme.secondaryBackground }]}>
          <Icon name="planet-outline" color={theme.tint} size={18} />
          <Text style={styles.title}>{title}</Text>
          {typeLabel.toLowerCase() !== title.toLowerCase() ? (
            <Text secondary style={styles.type}>{typeLabel}</Text>
          ) : null}
        </View>
        {bridge ? (
          <Text secondary style={styles.bridge}>via {bridge}</Text>
        ) : null}
      </View>

      {visibleFacts.length > 0 ? (
        <View style={[styles.facts, { backgroundColor: theme.secondaryBackground }]}>
          {visibleFacts.map(fact => (
            <View
              key={fact.key}
              style={[styles.fact, { backgroundColor: theme.secondaryBackground }]}
            >
              <Text secondary style={styles.factLabel}>{fact.label}</Text>
              <Text selectable style={styles.factValue}>{fact.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {canonicalUrl || canExpand || bookReference || mapUrl || gpxUrl ? (
        <View style={[styles.actions, { backgroundColor: theme.secondaryBackground }]}>
          {bookReference && navigation ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage this book in your library"
              onPress={event => {
                event.stopPropagation();
                navigation.navigate("BookLibrary", {
                  book: bookReferenceFromFields(
                    bookReference,
                    typeof presentation.fields.title === "string" ? presentation.fields.title : "Book",
                    presentation.fields,
                    typeof presentation.fields.image === "string" ? presentation.fields.image : undefined,
                  ),
                });
              }}
              style={styles.action}
            >
              <Icon name="library-outline" color={theme.tint} size={18} />
              <Text style={{ color: theme.tint }}>My books</Text>
            </Pressable>
          ) : null}
          {mapUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={event => {
                event.stopPropagation();
                void openExternalLink(mapUrl);
              }}
              style={styles.action}
            >
              <Icon name="map-outline" color={theme.tint} size={18} />
              <Text style={{ color: theme.tint }}>Route start</Text>
            </Pressable>
          ) : null}
          {gpxUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={event => {
                event.stopPropagation();
                void openExternalLink(gpxUrl);
              }}
              style={styles.action}
            >
              <Icon name="download-outline" color={theme.tint} size={18} />
              <Text style={{ color: theme.tint }}>GPX</Text>
            </Pressable>
          ) : null}
          {canonicalUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open original resource"
              onPress={event => {
                event.stopPropagation();
                void openExternalLink(canonicalUrl);
              }}
              style={styles.action}
            >
              <Icon name="open-outline" color={theme.tint} size={18} />
              <Text style={{ color: theme.tint }}>Open original</Text>
            </Pressable>
          ) : null}
          {canExpand ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Show fewer details" : "Show all details"}
              onPress={event => {
                event.stopPropagation();
                setExpanded(value => !value);
              }}
              style={styles.action}
            >
              <Icon
                name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
                color={theme.tint}
                size={18}
              />
              <Text style={{ color: theme.tint }}>
                {expanded ? "Fewer details" : "All details"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  header: { gap: 4 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  title: { fontSize: 16, fontWeight: "700" },
  type: { flex: 1, fontSize: 12, textAlign: "right" },
  bridge: { fontSize: 12 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: { minWidth: "45%", flexGrow: 1, flexBasis: 140 },
  factLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  factValue: { fontSize: 14, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  action: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 44,
  },
});

/* end of NativeStatusContext.tsx */
