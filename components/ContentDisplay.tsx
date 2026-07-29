/*
    Project: Hoot Mobile
    -------------------

    File: ContentDisplay.tsx

    Purpose:

        Render Lotide post, comment, and community description content in
        native React Native views.

    Responsibilities:

        • Choose the best available server-provided content representation
        • Render sanitized text fallback content through the HTML renderer
        • Apply Hoot theme styling to common HTML elements
        • Provide compact plain-text previews when callers request maxChars

    This file intentionally does NOT contain:

        • Lotide API fetching
        • Markdown editing or full Markdown compatibility
        • WebView-based embedded media rendering
*/

import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import RenderHtml, {
  TChildrenRenderer,
  TNodeChildrenRenderer,
  type CustomRendererProps,
  type CustomTagRendererRecord,
  type MixedStyleDeclaration,
  type MixedStyleRecord,
  type TBlock,
  type TPhrasing,
} from "react-native-render-html";
import Icon from "@expo/vector-icons/Ionicons";
import useTheme from "../hooks/useTheme";
import { TOUCH_TARGET_HIT_SLOP } from "../constants/TouchTargets";
import { openExternalLink } from "../utils/externalLink";

export interface ContentDisplayProps {
  contentHtml?: string | null;
  contentText?: string | null;
  contentMarkdown?: string | null;
  maxChars?: number;
  postId?: PostId;
}

const IGNORED_DOM_TAGS = ["iframe", "script"];

export default function ContentDisplay(props: ContentDisplayProps) {
  const {
    contentHtml,
    contentMarkdown,
    contentText,
    maxChars,
  } = props;
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { html, isTruncated } = useMemo(
    () => buildDisplayHtml({
      contentHtml,
      contentMarkdown,
      contentText,
      maxChars,
    }),
    [contentHtml, contentMarkdown, contentText, maxChars],
  );

  const contentWidth = Math.max(0, width - 30);
  const monoFont = Platform.OS === "ios" ? "Menlo" : "monospace";

  const source = useMemo(() => ({ html }), [html]);
  const renderers = useMemo(
    () => ({
      abbr: AbbrRenderer,
      details: DetailsRenderer,
      img: ImageRenderer,
    }) as unknown as CustomTagRendererRecord,
    [],
  );
  const renderersProps = useMemo(
    () => ({
      a: {
        onPress: (_event: unknown, href: string) => {
          void openExternalLink(href);
        },
      },
    }),
    [],
  );
  const baseStyle = useMemo<MixedStyleDeclaration>(
    () => ({
      color: theme.text,
    }),
    [theme.text],
  );
  const tagsStyles = useMemo<MixedStyleRecord>(
    () => ({
      a: {
        color: theme.secondaryTint,
      },
      blockquote: {
        borderLeftWidth: 2,
        borderColor: theme.secondaryText,
        paddingLeft: 10,
        paddingVertical: 5,
      },
      cite: { fontStyle: "italic" },
      del: {
        textDecorationLine: "line-through",
        textDecorationStyle: "solid",
      },
      dfn: { fontStyle: "italic" },
      hr: {
        borderBottomWidth: StyleSheet.hairlineWidth || 1,
        borderColor: theme.secondaryText,
        marginVertical: 8,
      },
      ins: { textDecorationLine: "underline" },
      kbd: {
        backgroundColor: theme.tertiaryBackground,
        paddingHorizontal: 4,
      },
      samp: { fontFamily: monoFont },
      small: { fontSize: 10 },
      sub: { fontSize: 10 },
      sup: { fontSize: 10 },
    }),
    [
      monoFont,
      theme.secondaryText,
      theme.secondaryTint,
      theme.tertiaryBackground,
    ],
  );

  return (
    <View>
      <RenderHtml
        contentWidth={contentWidth}
        source={source}
        ignoredDomTags={IGNORED_DOM_TAGS}
        renderers={renderers}
        renderersProps={renderersProps}
        baseStyle={baseStyle}
        tagsStyles={tagsStyles}
      />
      {isTruncated && (
        <Text style={{ color: theme.secondaryText, paddingVertical: 15 }}>
          Read More
        </Text>
      )}
    </View>
  );
}

function buildDisplayHtml(props: ContentDisplayProps) {
  const fullHtml =
    props.contentHtml ||
    parseMarkdown(props.contentMarkdown) ||
    `<p>${escapeHtml(props.contentText ?? "")}</p>`;

  if (!props.maxChars || props.maxChars <= 0) {
    return {
      html: fullHtml,
      isTruncated: false,
    };
  }

  const plainText = getBestPlainText(props);

  if (plainText.length <= props.maxChars) {
    return {
      html: fullHtml,
      isTruncated: false,
    };
  }

  return {
    html: `<p>${escapeHtml(plainText.substring(0, props.maxChars))}...</p>`,
    isTruncated: true,
  };
}

function getBestPlainText(props: ContentDisplayProps) {
  if (props.contentText) {
    return props.contentText;
  }

  if (props.contentMarkdown) {
    return stripMarkdown(props.contentMarkdown);
  }

  return stripHtml(props.contentHtml ?? "");
}

function parseMarkdown(markdown?: string | null): string | undefined {
  if (!markdown) return undefined;

  return escapeHtml(markdown)
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.*)\*\*/gim, "<b>$1</b>")
    .replace(/\*(.*)\*/gim, "<i>$1</i>")
    .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
    .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
    .replace(/\n$/gim, "<br />")
    .trim();
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/!\[(.*?)\]\((.*?)\)/gim, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/gim, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function AbbrRenderer({
  tnode,
}: CustomRendererProps<TPhrasing | TBlock>) {
  return (
    <Pressable
      accessibilityLabel="Show abbreviation"
      accessibilityRole="button"
      hitSlop={TOUCH_TARGET_HIT_SLOP}
      onPress={() => Alert.alert("Abbr.", tnode.attributes.title)}
    >
      <Text
        style={{
          textDecorationLine: "underline",
          textDecorationStyle: "dotted",
        }}
      >
        <TNodeChildrenRenderer tnode={tnode} />
      </Text>
    </Pressable>
  );
}

function DetailsRenderer({
  tnode,
}: CustomRendererProps<TBlock>) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();
  const summaryNode = tnode.children.find(child => child.tagName === "summary");
  const summaryNodes = summaryNode ? [summaryNode] : [];
  const bodyNodes = tnode.children.filter(child => child !== summaryNode);

  return (
    <View>
      <Pressable
        accessibilityLabel={isOpen ? "Collapse details" : "Expand details"}
        accessibilityRole="button"
        hitSlop={TOUCH_TARGET_HIT_SLOP}
        onPress={() => setIsOpen(x => !x)}
      >
        <Text style={{ color: theme.secondaryTint }}>
          {isOpen ? (
            <Icon name="chevron-down-outline" />
          ) : (
            <Icon name="chevron-forward-outline" />
          )}
          {summaryNodes.length > 0 ? (
            <TChildrenRenderer tchildren={summaryNodes} />
          ) : (
            "Details"
          )}
        </Text>
      </Pressable>
      {isOpen && <TChildrenRenderer tchildren={bodyNodes} />}
    </View>
  );
}

function ImageRenderer() {
  return <Text>[Image not displayed]</Text>;
}

/* end of ContentDisplay.tsx */
