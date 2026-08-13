/*
    Project: Hoot Unfathomably
    --------------------------

    File: MediaViewerScreen.tsx

    Purpose:

        Play an audio or video status attachment inside a guarded viewer.

    Responsibilities:

        - Validate the media and poster URLs before rendering them
        - Provide native WebView media controls without arbitrary scripting
        - Keep playback behind an explicit user action

    This file intentionally does NOT contain:

        - media downloads or background playback
        - authenticated media proxying
        - post or timeline presentation
*/

import React from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

import { Text, View } from "../components/Themed";
import type { RootStackScreenProps } from "../types";

function safeWebUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mediaDocument(
  uri: string,
  type: "audio" | "video",
  posterUri?: string,
): string {
  const safeUri = escapeHtmlAttribute(uri);
  const safePoster = posterUri
    ? ` poster="${escapeHtmlAttribute(posterUri)}"`
    : "";
  const media = type === "audio"
    ? `<audio controls preload="metadata" src="${safeUri}"></audio>`
    : `<video controls playsinline preload="metadata" src="${safeUri}"${safePoster}></video>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src https: http:; img-src https: http:; style-src 'unsafe-inline'">
<style>html,body{background:#000;height:100%;margin:0}body{align-items:center;display:flex;justify-content:center}audio{width:92%}video{height:100%;width:100%}</style>
</head>
<body>${media}</body>
</html>`;
}

export default function MediaViewerScreen({
  route,
}: RootStackScreenProps<"MediaViewer">) {
  const uri = safeWebUrl(route.params.uri);
  const posterUri = safeWebUrl(route.params.posterUri);

  if (!uri) {
    return (
      <View style={styles.message}>
        <Text style={styles.title}>This attachment cannot be opened.</Text>
        <Text secondary>The server supplied an unsupported media address.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WebView
        accessibilityLabel={route.params.description || `${route.params.type} attachment`}
        allowFileAccess={false}
        allowsFullscreenVideo
        javaScriptEnabled={false}
        mediaPlaybackRequiresUserAction
        mixedContentMode="never"
        originWhitelist={["about:blank"]}
        source={{ html: mediaDocument(uri, route.params.type, posterUri) }}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#000000", flex: 1 },
  webView: { backgroundColor: "#000000" },
  message: { flex: 1, gap: 8, justifyContent: "center", padding: 24 },
  title: { fontSize: 19, fontWeight: "700" },
});

/* end of MediaViewerScreen.tsx */
