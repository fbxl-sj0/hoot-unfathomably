/*
    Project: Hoot Mobile
    -------------------

    File: externalLink.ts

    Purpose:

        Open user-visible external links through one guarded policy.

    Responsibilities:

        - Normalize obvious bare web domains to https URLs
        - Reject unsupported schemes before asking the platform to open them
        - Show the original link text when the platform cannot open a link

    This file intentionally does NOT contain:

        - In-app navigation
        - Haptic feedback policy
        - HTML rendering
*/

import { Alert } from "react-native";
import { openURL } from "expo-linking";

export function getOpenableExternalUrl(url: string): string | undefined {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) return undefined;

  if (/^(https?:|mailto:)/i.test(trimmedUrl)) return trimmedUrl;

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedUrl)) return undefined;

  if (
    /^(?:www\.|m\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/:?#]|$)/i.test(
      trimmedUrl,
    )
  ) {
    return `https://${trimmedUrl}`;
  }

  return undefined;
}

export async function openExternalLink(url: string): Promise<boolean> {
  const openableUrl = getOpenableExternalUrl(url);

  if (!openableUrl) {
    showExternalLinkFallback(url);
    return false;
  }

  try {
    await openURL(openableUrl);
    return true;
  } catch {
    showExternalLinkFallback(url);
    return false;
  }
}

function showExternalLinkFallback(url: string) {
  Alert.alert("Link", url, undefined, { cancelable: true });
}

/* end of externalLink.ts */
