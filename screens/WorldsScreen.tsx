/*
    Project: Hoot Unfathomably
    --------------------------

    File: WorldsScreen.tsx

    Purpose:

        Browse, follow, and search Unfathomably's specialized social Worlds.

    Responsibilities:

        - Present the server-supported Worlds families in plain language
        - Load native status timelines without mixing in ordinary statuses
        - Search provider-neutral discovery results with explicit pagination
        - Resolve a selected result through the signed-in local server

    This file intentionally does NOT contain:

        - provider-specific search requests
        - native-object authoring forms
        - bottom-tab navigation policy
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet } from "react-native";

import RetryState from "../components/RetryState";
import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import WorldDiscoveryCard from "../components/WorldDiscoveryCard";
import {
  getWorldDefinition,
  WORLD_DEFINITIONS,
  WORLD_SECTIONS,
  WorldFamily,
} from "../constants/Worlds";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import type { UnfathomablyStatus } from "../services/UnfathomablyService";
import {
  getWorldTimeline,
  getWorldWorkflows,
  resolveNativeObject,
  searchWorlds,
  WorldDiscoveryItem,
  WorldDiscoveryPage,
  WorldWorkflowManifest,
} from "../services/UnfathomablyWorldsService";
import { getErrorMessage } from "../utils/error";

type WorldsView = "browse" | "feed" | "find";

const EMPTY_DISCOVERY_PAGE: WorldDiscoveryPage = {
  hasMore: false,
  items: [],
  providers: [],
  total: 0,
};

export default function WorldsScreen({ navigation, route }: { navigation: any; route: { params?: { family?: WorldFamily; view?: WorldsView } } }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [view, setView] = useState<WorldsView>(route.params?.view || "browse");
  const [family, setFamily] = useState<WorldFamily>(route.params?.family || "all");
  const [manifest, setManifest] = useState<WorldWorkflowManifest>();
  const [statuses, setStatuses] = useState<UnfathomablyStatus[]>([]);
  const [discovery, setDiscovery] = useState<WorldDiscoveryPage>(EMPTY_DISCOVERY_PAGE);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string>();

  useEffect(() => {
    if (!ctx?.login) return;
    let active = true;
    void getWorldWorkflows(ctx)
      .then(next => {
        if (active) setManifest(next);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [ctx]);

  const loadFeed = useCallback(async (append = false) => {
    if (!ctx?.login || loading) return;
    setLoading(true);
    setError("");
    try {
      const next = await getWorldTimeline(
        ctx,
        family,
        append ? statuses.at(-1)?.id : undefined,
      );
      setStatuses(existing => append
        ? [...existing, ...next.filter(item => !existing.some(old => old.id === item.id))]
        : next);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [ctx, family, loading, statuses]);

  const runSearch = useCallback(async (append = false) => {
    if (!ctx?.login || loading) return;
    const offset = append ? discovery.nextOffset : 0;
    if (append && offset === undefined) return;
    setLoading(true);
    setError("");
    try {
      const next = await searchWorlds(ctx, family, search, offset || 0);
      setDiscovery(existing => append
        ? {
            ...next,
            items: [
              ...existing.items,
              ...next.items.filter(item => !existing.items.some(old => old.id === item.id)),
            ],
          }
        : next);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [ctx, discovery.nextOffset, family, loading, search]);

  useEffect(() => {
    if (!ctx?.login || view !== "feed") return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void getWorldTimeline(ctx, family)
        .then(next => {
          if (active) setStatuses(next);
        })
        .catch(reason => {
          if (active) setError(getErrorMessage(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ctx, family, view]);

  const supportedFamilies = useMemo(
    () => new Set(manifest?.workflows.map(workflow => workflow.family) || []),
    [manifest],
  );

  if (!ctx?.login) return <SuggestLogin />;

  async function openDiscoveryItem(item: WorldDiscoveryItem) {
    if (openingId) return;
    if (item.statusId) {
      navigation.navigate("Status", { statusId: item.statusId });
      return;
    }

    setOpeningId(item.id);
    try {
      const resolved = await resolveNativeObject(ctx as LotideContext, item.activitypubUrl || item.url);
      if (resolved.resultType === "status") {
        navigation.navigate("Status", { statusId: resolved.status.id });
      } else {
        navigation.navigate("NativeResource", { resource: resolved.resource });
      }
    } catch (reason) {
      Alert.alert("Could not open this item", getErrorMessage(reason));
    } finally {
      setOpeningId(undefined);
    }
  }

  function chooseFamily(nextFamily: WorldFamily, nextView: WorldsView) {
    setFamily(nextFamily);
    setView(nextView);
    setError("");
    setDiscovery(EMPTY_DISCOVERY_PAGE);
  }

  const controls = (
    <View style={[styles.controls, { borderColor: theme.tertiaryBackground }]}>
      <View style={styles.modeRow}>
        {(["browse", "feed", "find"] as WorldsView[]).map(mode => (
          <Pressable
            accessibilityLabel={mode === "browse" ? "Browse" : mode === "feed" ? "Feed" : "Find"}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === mode }}
            key={mode}
            onPress={() => setView(mode)}
            style={[styles.mode, view === mode && { backgroundColor: theme.tint }]}
          >
            <Icon
              name={mode === "browse" ? "grid-outline" : mode === "feed" ? "list-outline" : "search-outline"}
              color={view === mode ? theme.background : theme.text}
              size={19}
            />
            <Text style={view === mode ? { color: theme.background } : undefined}>
              {mode === "browse" ? "Browse" : mode === "feed" ? "Feed" : "Find"}
            </Text>
          </Pressable>
        ))}
      </View>
      {view !== "browse" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyRow}>
          <FamilyPill family="all" selected={family === "all"} onPress={() => chooseFamily("all", view)} />
          {WORLD_DEFINITIONS.map(definition => (
            <FamilyPill
              family={definition.family}
              key={definition.family}
              selected={family === definition.family}
              onPress={() => chooseFamily(definition.family, view)}
            />
          ))}
        </ScrollView>
      ) : null}
      {view === "find" ? (
        <View style={styles.searchRow}>
          <TextInput
            onChangeText={setSearch}
            onSubmitEditing={() => { void runSearch(); }}
            placeholder={getWorldDefinition(family)?.searchPlaceholder || "Find something across Worlds"}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search Worlds"
            onPress={() => { void runSearch(); }}
            style={[styles.searchButton, { backgroundColor: theme.tint }]}
          >
            <Icon name="search-outline" color={theme.background} size={23} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (view === "browse") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.browser}>
        {controls}
        <Text style={styles.heading}>Explore by what you want to do</Text>
        <Text secondary>
          Worlds combines compatible federated services behind familiar categories. Your server remains the trust boundary.
        </Text>
        {WORLD_SECTIONS.map(section => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text secondary>{section.description}</Text>
            <View style={styles.worldGrid}>
              {section.families.map(definition => {
                const knownUnsupported = !!manifest && !supportedFamilies.has(definition.family);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${definition.title} World`}
                    disabled={knownUnsupported}
                    key={definition.family}
                    onPress={() => chooseFamily(definition.family, "feed")}
                    style={[
                      styles.world,
                      { backgroundColor: theme.secondaryBackground },
                      knownUnsupported && styles.disabled,
                    ]}
                  >
                    <Icon name={worldIcon(definition.family)} color={theme.tint} size={25} />
                    <Text style={styles.worldTitle}>{definition.title}</Text>
                    <Text secondary numberOfLines={3}>{definition.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  if (view === "feed") {
    return (
      <View style={styles.root}>
        <FlatList
          data={statuses}
          keyExtractor={status => status.id}
          ListHeaderComponent={controls}
          ListEmptyComponent={error
            ? <RetryState message={error} onRetry={() => { void loadFeed(); }} />
            : loading ? null : <Text style={styles.empty}>No native posts are available in this World yet.</Text>}
          onEndReached={() => { void loadFeed(true); }}
          onEndReachedThreshold={0.7}
          onRefresh={() => { void loadFeed(); }}
          refreshing={loading && statuses.length === 0}
          renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={discovery.items}
        keyExtractor={item => item.id}
        ListHeaderComponent={controls}
        ListEmptyComponent={error
          ? <RetryState message={error} onRetry={() => { void runSearch(); }} />
          : loading ? null : <Text style={styles.empty}>Search this World by title, creator, or URL.</Text>}
        ListFooterComponent={discovery.hasMore ? (
          <Pressable accessibilityRole="button" onPress={() => { void runSearch(true); }} style={styles.loadMore}>
            <Text tint>{loading ? "Loading..." : "Load more"}</Text>
          </Pressable>
        ) : null}
        renderItem={({ item }) => (
          <WorldDiscoveryCard
            item={item}
            onOpenHere={() => { void openDiscoveryItem(item); }}
            opening={openingId === item.id}
          />
        )}
      />
    </View>
  );
}

function FamilyPill({ family, selected, onPress }: { family: WorldFamily; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.familyPill, selected && { backgroundColor: theme.tint }]}
    >
      <Text style={selected ? { color: theme.background } : undefined}>
        {getWorldDefinition(family)?.title || "All"}
      </Text>
    </Pressable>
  );
}

function worldIcon(family: Exclude<WorldFamily, "all">): React.ComponentProps<typeof Icon>["name"] {
  const icons: Record<Exclude<WorldFamily, "all">, React.ComponentProps<typeof Icon>["name"]> = {
    audio: "headset-outline",
    bookmarks: "bookmark-outline",
    books: "book-outline",
    coordination: "hand-left-outline",
    culture: "color-palette-outline",
    development: "code-slash-outline",
    events: "calendar-outline",
    games: "game-controller-outline",
    groups: "people-outline",
    longform: "document-text-outline",
    marketplace: "storefront-outline",
    models: "cube-outline",
    photo: "camera-outline",
    publishing: "newspaper-outline",
    routes: "map-outline",
    video: "videocam-outline",
  };
  return icons[family];
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  browser: { gap: 13, paddingBottom: 24 },
  controls: { borderBottomWidth: 1, gap: 10, padding: 12 },
  modeRow: { flexDirection: "row", gap: 7 },
  mode: { alignItems: "center", borderRadius: 9, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 48, paddingHorizontal: 8 },
  familyRow: { gap: 7 },
  familyPill: { borderRadius: 18, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, minHeight: 48 },
  searchButton: { alignItems: "center", borderRadius: 9, justifyContent: "center", minHeight: 48, width: 52 },
  heading: { fontSize: 23, fontWeight: "700", marginHorizontal: 15, marginTop: 3 },
  section: { gap: 8, paddingHorizontal: 15 },
  sectionTitle: { fontSize: 19, fontWeight: "700" },
  worldGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  world: { borderRadius: 10, flexBasis: 155, flexGrow: 1, gap: 6, minHeight: 145, padding: 12 },
  worldTitle: { fontSize: 17, fontWeight: "700" },
  disabled: { opacity: 0.38 },
  empty: { padding: 30, textAlign: "center" },
  loadMore: { alignItems: "center", justifyContent: "center", minHeight: 54 },
});

/* end of WorldsScreen.tsx */
