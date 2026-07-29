/*
    Project: Hoot Mobile
    -------------------

    File: HrefDisplay.tsx

    Purpose:

        Render a post link preview and open action.

    Responsibilities:

        - Load URL metadata through the href hook
        - Show link title and domain details
        - Open external links through the platform browser

    This file intentionally does NOT contain:

        - HTML content rendering
        - Lotide post fetching
*/

import React, { useState } from "react";
import {
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import Icon from "@expo/vector-icons/Ionicons";
import { Text } from "./Themed";
import * as Haptics from "../services/HapticService";
import useTheme from "../hooks/useTheme";
import useHrefData from "../hooks/useHrefData";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";
import {
  getOpenableExternalUrl,
  openExternalLink,
} from "../utils/externalLink";

export default function HrefDisplay({ href }: { href: string }) {
  const [imgAspect, setImgAspect] = useState(1);
  const hrefData = useHrefData(href);
  const theme = useTheme();
  const imageLinkUrl =
    hrefData.imageUrl && hrefData.linkUrl && !hrefData.isVideo
      ? hrefData.linkUrl
      : undefined;

  function openLink() {
    const linkUrl = hrefData.linkUrl;
    if (!linkUrl) return;

    const openableUrl = getOpenableExternalUrl(linkUrl);

    if (!openableUrl) {
      void openExternalLink(linkUrl);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      // Link opening should still continue if platform haptics are unavailable.
    });

    void openExternalLink(linkUrl);
  }

  function renderImagePreview() {
    if (!hrefData.imageUrl) return null;

    return (
      <ImageBackground
        style={[
          styles.image,
          {
            aspectRatio: imgAspect,
            backgroundColor: theme.secondaryBackground,
          },
        ]}
        imageStyle={{
          resizeMode: "contain",
        }}
        source={{
          uri: hrefData.imageUrl,
        }}
        onLoad={event => {
          Platform.OS !== "web" &&
            setImgAspect(getSafeImageAspect(event.nativeEvent.source));
        }}
      >
        {hrefData.isVideo && (
          <Pressable
            accessibilityLabel="Open video link"
            accessibilityRole="button"
            onPress={openLink}
          >
            <Icon
              name="play-outline"
              size={70}
              color="#ffffffaa"
              style={styles.playIcon}
            />
          </Pressable>
        )}
      </ImageBackground>
    );
  }

  return (
    <>
      {!!hrefData.imageUrl &&
        (imageLinkUrl ? (
          <Pressable
            accessibilityLabel={`Open image link ${imageLinkUrl}`}
            accessibilityRole="link"
            onPress={openLink}
          >
            {renderImagePreview()}
          </Pressable>
        ) : (
          renderImagePreview()
        ))}
      {!!hrefData.linkUrl && !imageLinkUrl && (
        <Pressable
          accessibilityLabel={`Open link ${hrefData.linkUrl}`}
          accessibilityRole="link"
          style={[
            styles.link,
            !!hrefData.imageUrl && styles.wideLink,
            { backgroundColor: theme.secondaryBackground },
          ]}
          onPress={openLink}
        >
          <Text>{hrefData.linkUrl}</Text>
        </Pressable>
      )}
    </>
  );
}

export function getSafeImageAspect(source: { width?: number; height?: number }) {
  if (
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    !source.width ||
    !source.height
  ) {
    return 1;
  }

  return Math.max(source.width / source.height, 0.5);
}

const styles = StyleSheet.create({
  link: {
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginHorizontal: 15,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  wideLink: {
    marginHorizontal: 0,
    borderRadius: 0,
  },
  image: {
    height: Platform.OS === "web" ? 400 : undefined,
    resizeMode: "contain",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon:
    Platform.OS === "web"
      ? {}
      : {
          shadowColor: "#000000",
          shadowOpacity: 1,
          shadowRadius: 5,
          shadowOffset: {
            width: 0, // These can't both be 0
            height: 3, // i.e. the shadow has to be offset in some way
          },
        },
});

/* end of HrefDisplay.tsx */
