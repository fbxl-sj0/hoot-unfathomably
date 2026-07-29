/*
    Project: Hoot Mobile
    -------------------

    File: useHrefData.ts

    Purpose:

        Build initial metadata for external URL previews.

    Responsibilities:

        - Identify direct image URLs
        - Identify YouTube video preview images
        - Expose preview state to link components

    This file intentionally does NOT contain:

        - opening links
        - HTML rendering
*/

import { useMemo } from "react";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".gif",
  ".webp",
]);

/**
 * This hook will return multiple times as its answer becomes more accurate
 *
 * Much of the data needs to be fetched from third parties
 */
export default function useHrefData(href: string): HrefData {
  const hrefData = useMemo<HrefData>(() => getHrefData(href), [href]);

  return hrefData;
}

export function getHrefData(href: string): HrefData {
  const cleanHref = href.trim();

  if (!cleanHref) return {};

  // Plain image URLs are still links. The preview can render the image while
  // preserving an external-open action for the original image.
  if (isImageUrl(cleanHref)) {
    return {
      imageUrl: cleanHref,
      linkUrl: cleanHref,
    };
  }

  const youtubeId = getYouTubeVideoId(cleanHref);
  if (youtubeId) {
    return {
      imageUrl: `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`,
      linkUrl: cleanHref,
      isVideo: true,
    };
  }

  return { linkUrl: cleanHref };
}

function getYouTubeVideoId(url: string): string | undefined {
  const ytRegx =
    /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-z0-9_-]{11})(?:\S+)?$/i;
  const ytMatch = url.match(ytRegx);

  return ytMatch?.[1];
}

function isImageUrl(url: string): boolean {
  if (hasUnsupportedScheme(url)) return false;

  return (
    IMAGE_EXTENSIONS.has(getPathExtension(url)) ||
    /^https?:\/\/.*\/api\/stable\/posts\/.*\/href(?:[?#].*)?$/i.test(url)
  );
}

function hasUnsupportedScheme(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url);
}

function getPathExtension(url: string): string {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, "");
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dotIndex = filename.lastIndexOf(".");

  if (dotIndex < 0) return "";

  return filename.slice(dotIndex).toLowerCase();
}

/* end of useHrefData.ts */
