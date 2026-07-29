/*
    Project: Hoot Mobile
    -------------------

    File: CommunityFinder.tsx

    Purpose:

        Search and page through Lotide communities for selection flows.

    Responsibilities:

        - Load followed or global community lists
        - Filter communities from typed input
        - Return selected communities to the caller

    This file intentionally does NOT contain:

        - community detail rendering
        - post creation state
*/

import React, { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Icon from "@expo/vector-icons/Ionicons";
import * as LotideService from "../services/LotideService";
import ActorDisplayComponent from "./ActorDisplay";
import ContentDisplay from "./ContentDisplay";
import RetryState from "./RetryState";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";

export interface CommunityFinderProps {
  placeholder?: string;
  onlyWhenTyping?: boolean;
  onlyFollowing?: boolean;
  focusId?: number;
  onSelect: (community: Community) => void;
}

type CommunityFinderState = {
  key: string;
  communities: Community[];
  isLoading: boolean;
  loadError: string;
};

export default function CommunityFinder(props: CommunityFinderProps) {
  const [filterText, setFilterText] = useState("");
  const [communityState, setCommunityState] =
    useState<CommunityFinderState>();
  const [reloadId, setReloadId] = useState(0);
  const ctx = useLotideCtx();
  const theme = useTheme();
  const listKey = [
    ctx?.apiUrl ?? "",
    ctx?.login?.user?.id ?? "anonymous",
    props.onlyFollowing ? "mine" : "everything",
    props.focusId ?? 0,
    reloadId,
  ].join("|");
  const currentState = communityState?.key === listKey
    ? communityState
    : undefined;
  const communities = currentState?.communities;
  const isLoadingCommunities = !currentState || currentState.isLoading;
  const loadError = currentState?.loadError ?? "";

  const communitiesToDisplay = (() => {
    if (props.onlyWhenTyping && filterText === "") return [];
    if (!communities) return [];
    if (filterText === "") return communities;
    return communities.filter(c =>
      c.name.toLowerCase().includes(filterText.toLowerCase()),
    );
  })();

  useEffect(() => {
    if (!ctx) return;

    let isActive = true;

    LotideService.getAllCommunities(ctx, props.onlyFollowing || false)
      .then(communities => {
        if (isActive) {
          setCommunityState({
            key: listKey,
            communities,
            isLoading: false,
            loadError: "",
          });
        }
      })
      .catch(() => {
        if (isActive) {
          setCommunityState(previousState => ({
            key: listKey,
            communities: previousState?.key === listKey
              ? previousState.communities
              : [],
            isLoading: false,
            loadError: "Cannot load communities",
          }));
        }
      });

    return () => {
      isActive = false;
    };
  }, [ctx, listKey, props.onlyFollowing, reloadId]);

  const renderItem = ({ item }: { item: Community }) => {
    const description = item.description;
    const descriptionText = typeof description === "string" ? description : "";
    const descriptionMarkdown =
      description && typeof description !== "string" ? description.content_markdown : "";
    const descriptionHtml =
      description && typeof description !== "string" ? description.content_html : "";
    const truncatedDescription =
      descriptionText && descriptionText.length > 120
        ? `${descriptionText.substring(0, 120)}...`
        : descriptionText;

    return (
      <Pressable
        accessibilityLabel={`Select community ${item.name}@${item.host}`}
        accessibilityRole="button"
        onPress={() => props.onSelect(item)}
        style={[
          styles.item,
          {
            borderColor: theme.tertiaryBackground,
          },
        ]}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <ActorDisplayComponent
            name={item.name}
            host={item.host}
            local={item.local}
            colorize={"always"}
            newLine
          />
          <View style={{ display: "flex", flexDirection: "row" }}>
            {item.you_are_moderator && (
              <Icon
                name="shield-outline"
                size={20}
                color={theme.secondaryTint}
              />
            )}
            {item.your_follow?.accepted && (
              <Icon
                name="checkmark"
                size={20}
                color={theme.secondaryTint}
                style={{ marginLeft: 5 }}
              />
            )}
          </View>
        </View>
        {!!descriptionText && (
          <Text style={{ color: theme.secondaryText, marginTop: 10 }}>
            {truncatedDescription}
          </Text>
        )}
        {description && typeof description !== "string" && (
          <View style={{ marginTop: 10 }}>
            {!!(descriptionHtml || descriptionMarkdown || description.content_text) && (
              <ContentDisplay
                contentHtml={descriptionHtml}
                contentMarkdown={descriptionMarkdown}
                contentText={description.content_text}
                maxChars={120}
              />
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <FlatList
      data={communitiesToDisplay}
      renderItem={renderItem}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      contentContainerStyle={styles.list}
      stickyHeaderIndices={[0]}
      style={{ backgroundColor: theme.background }}
      ListEmptyComponent={
        <CommunityFinderEmptyState
          hasFilter={filterText.trim() !== ""}
          isLoading={isLoadingCommunities}
          loadError={loadError}
          onRetry={() => setReloadId(value => value + 1)}
          onlyWhenTyping={props.onlyWhenTyping || false}
        />
      }
      ListHeaderComponent={
        <View style={{ backgroundColor: theme.background, padding: 15 }}>
          <TextInput
            placeholder={props.placeholder || "Filter communities"}
            placeholderTextColor={theme.placeholderText}
            value={filterText}
            onChangeText={setFilterText}
            style={[styles.input, { color: theme.text }]}
          />
        </View>
      }
    />
  );
}

function CommunityFinderEmptyState({
  hasFilter,
  isLoading,
  loadError,
  onRetry,
  onlyWhenTyping,
}: {
  hasFilter: boolean;
  isLoading: boolean;
  loadError: string;
  onRetry: () => void;
  onlyWhenTyping: boolean;
}) {
  const theme = useTheme();

  if (onlyWhenTyping && !hasFilter) return null;

  if (loadError) {
    return (
      <RetryState
        compact
        message={loadError}
        onRetry={onRetry}
        style={styles.emptyState}
      />
    );
  }

  if (isLoading) {
    return (
      <View style={styles.emptyState}>
        <Text style={{ color: theme.secondaryText }}>Loading communities...</Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Text style={{ color: theme.secondaryText }}>
        {hasFilter ? "No matching communities" : "No communities found"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    marginHorizontal: 25,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingVertical: 10,
  },
  list: {
    paddingBottom: 50,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "stretch",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth || 1,
    paddingHorizontal: 20,
    marginHorizontal: 20,
  },
  emptyState: {
    marginHorizontal: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});

/* end of CommunityFinder.tsx */
