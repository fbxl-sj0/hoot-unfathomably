/*
    Project: Hoot Unfathomably
    --------------------------

    File: StatusLinkPreview.tsx

    Purpose:

        Render a tappable preview for an external link in a status.

    Responsibilities:

        - Prefer Mastodon-compatible preview-card metadata from the server
        - Fall back to a safe external link found in status HTML
        - Ignore mention and hashtag links when selecting a fallback
        - Open the destination through the shared external-link policy

    This file intentionally does NOT contain:

        - Third-party metadata scraping
        - Status navigation
        - Fediverse API requests
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { Text } from "./Themed";
import useTheme from "../hooks/useTheme";
import type { UnfathomablyPreviewCard } from "../services/UnfathomablyService";
import { getHrefData } from "../hooks/useHrefData";
import { getOpenableExternalUrl, openExternalLink } from "../utils/externalLink";

export default function StatusLinkPreview({
  card,
  content,
}: {
  card?: UnfathomablyPreviewCard | null;
  content: string;
}) {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const fallbackUrl = getFirstPreviewableLink(content);
  const cardDestination = getHttpUrl(card?.url);
  const destination = cardDestination || fallbackUrl;

  if (!destination) return null;

  const fallbackData = getHrefData(destination);
  const imageUrl = cardDestination
    ? getHttpUrl(card?.image) || fallbackData.imageUrl
    : fallbackData.imageUrl;
  const title = (cardDestination && cleanText(card?.title)) || destination;
  const description = cardDestination
    ? cleanText(card?.description)
    : undefined;
  const imageDescription = cardDestination
    ? cleanText(card?.image_description)
    : undefined;
  const provider =
    (cardDestination && cleanText(card?.provider_name)) ||
    getLinkHostname(destination);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open link preview ${title}`}
      onPress={event => {
        event.stopPropagation();
        void openExternalLink(destination);
      }}
      style={[
        styles.preview,
        {
          backgroundColor: theme.secondaryBackground,
          borderColor: theme.tertiaryBackground,
        },
      ]}
    >
      {!!imageUrl && !imageFailed && (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={imageDescription}
          onError={() => setImageFailed(true)}
          resizeMode="contain"
          source={{ uri: imageUrl }}
          style={[
            styles.image,
            { backgroundColor: theme.tertiaryBackground },
          ]}
        />
      )}
      <View style={styles.details}>
        <View style={styles.providerRow}>
          <Icon name="link-outline" size={15} color={theme.secondaryText} />
          <Text secondary numberOfLines={1} style={styles.provider}>
            {provider}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {!!description && (
          <Text secondary numberOfLines={3} style={styles.description}>
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function getFirstPreviewableLink(html: string): string | undefined {
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const attributes = match[1];
    const body = match[2];
    const className = readHtmlAttribute(attributes, "class") || "";
    const rel = readHtmlAttribute(attributes, "rel") || "";
    const anchorText = body.replace(/<[^>]*>/g, "").trim();

    if (
      /(?:^|\s)(?:mention|hashtag)(?:\s|$)/i.test(className) ||
      /(?:^|\s)tag(?:\s|$)/i.test(rel) ||
      /^[#@]/.test(anchorText)
    ) {
      continue;
    }

    const href = readHtmlAttribute(attributes, "href");
    const openableUrl = href && getHttpUrl(href);
    if (openableUrl) return openableUrl;
  }

  return undefined;
}

function readHtmlAttribute(
  attributes: string,
  name: string,
): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const match = attributes.match(pattern);
  const value = match?.[1] ?? match?.[2];

  return value ? decodeHtmlAttribute(value).trim() : undefined;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_entity, token: string) =>
      decodeCodePoint(token, 16, _entity),
    )
    .replace(/&#(\d+);/g, (_entity, token: string) =>
      decodeCodePoint(token, 10, _entity),
    );
}

function decodeCodePoint(token: string, radix: number, fallback: string): string {
  const codePoint = Number.parseInt(token, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function getHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const openableUrl = getOpenableExternalUrl(value);
  return openableUrl && /^https?:\/\//i.test(openableUrl)
    ? openableUrl
    : undefined;
}

function getLinkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

const styles = StyleSheet.create({
  preview: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  image: {
    height: 180,
    width: "100%",
  },
  details: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  providerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  provider: {
    flex: 1,
    fontSize: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});

/* end of StatusLinkPreview.tsx */
