/*
    Project: Hoot Unfathomably
    --------------------------

    File: StatusMediaAttachment.tsx

    Purpose:

        Render one status attachment with defensive thumbnail fallback.

    Responsibilities:

        - Prefer server-generated previews for efficient feed rendering.
        - Retry image attachments through full and remote media URLs.
        - Replace exhausted previews with a compact, tappable fallback.
        - Preserve explicit playback for audio and video attachments.

    This file intentionally does NOT contain:

        - Full-screen media playback or zoom controls.
        - Status actions or navigation policy.
        - Fediverse API requests.
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import { Text, View } from "./Themed";
import { UnfathomablyMediaAttachment } from "../services/UnfathomablyService";

type Props = {
  compact: boolean;
  media: UnfathomablyMediaAttachment;
  onOpen: () => void;
  secondaryBackground: string;
  tint: string;
};

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getMediaPreviewCandidates(
  media: UnfathomablyMediaAttachment,
): string[] {
  const candidates = media.type === "image"
    ? [media.preview_url, media.url, media.remote_url]
    : [media.preview_url];

  return [...new Set(candidates.filter(isHttpUrl))];
}

export function getMediaOpenCandidates(
  media: UnfathomablyMediaAttachment,
): string[] {
  return [...new Set(
    [media.url, media.remote_url, media.preview_url].filter(isHttpUrl),
  )];
}

export default function StatusMediaAttachment({
  compact,
  media,
  onOpen,
  secondaryBackground,
  tint,
}: Props) {
  const candidates = getMediaPreviewCandidates(media);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const previewUri = candidates[candidateIndex];
  const isPlayable = media.type === "audio" ||
    media.type === "video" ||
    media.type === "gifv";
  const accessibilityLabel = media.type === "image"
    ? "Open image full screen"
    : `Open ${media.type || "attachment"}`;

  function useNextCandidate() {
    setCandidateIndex(index => Math.min(index + 1, candidates.length));
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={event => {
        event.stopPropagation();
        onOpen();
      }}
      style={styles.mediaButton}
    >
      {previewUri ? (
        <Image
          testID={`status-media-${media.id}`}
          source={{ uri: previewUri }}
          onError={useNextCandidate}
          resizeMode="contain"
          style={[
            styles.media,
            compact && styles.compactMedia,
            { backgroundColor: secondaryBackground },
          ]}
        />
      ) : (
        <View
          style={[
            styles.attachmentFallback,
            { backgroundColor: secondaryBackground },
          ]}
        >
          <Icon
            name={isPlayable ? "play-circle-outline" : "image-outline"}
            size={34}
            color={tint}
          />
          <Text style={styles.attachmentLabel}>
            {isPlayable
              ? `Open ${media.type === "audio" ? "audio" : "video"} attachment`
              : "Media preview unavailable"}
          </Text>
        </View>
      )}
      {(media.type === "video" || media.type === "gifv") && !!previewUri && (
        <View pointerEvents="none" style={styles.playOverlay}>
          <Icon name="play-circle" size={52} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mediaButton: { position: "relative" },
  media: {
    borderRadius: 10,
    height: 220,
    marginTop: 12,
    width: "100%",
  },
  compactMedia: { height: 150 },
  attachmentFallback: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    minHeight: 82,
    padding: 16,
  },
  attachmentLabel: { fontSize: 16, fontWeight: "600" },
  playOverlay: {
    alignItems: "center",
    backgroundColor: "transparent",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 12,
  },
});

/* end of StatusMediaAttachment.tsx */
