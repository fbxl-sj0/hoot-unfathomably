/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablySourcesScreen.tsx

    Purpose:

        Read and manage the signed-in account's federated feeds and sources.

    Responsibilities:

        - Render the combined followed-sources timeline
        - List followed source identities and search approved sources
        - Apply explicit follow changes and preserve returned relationships
        - Explain unsupported source APIs on compatible older servers

    This file intentionally does NOT contain:

        - direct feed parsing or provider requests
        - source-item preview rendering
        - bottom-tab navigation policy
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";

import RetryState from "../components/RetryState";
import SourceCard from "../components/SourceCard";
import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import type { UnfathomablyStatus } from "../services/UnfathomablyService";
import {
  getSources,
  getSourcesTimeline,
  searchSources,
  setSourceFollowed,
  UnfathomablySource,
} from "../services/UnfathomablySourcesService";
import { getErrorMessage } from "../utils/error";

type SourcesView = "timeline" | "following" | "find";

export default function UnfathomablySourcesScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [view, setView] = useState<SourcesView>("timeline");
  const [statuses, setStatuses] = useState<UnfathomablyStatus[]>([]);
  const [sources, setSources] = useState<UnfathomablySource[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string>();

  const load = useCallback(async (append = false) => {
    if (!ctx?.login || loading) return;
    setLoading(true);
    setError("");
    try {
      if (view === "timeline") {
        const next = await getSourcesTimeline(ctx, append ? statuses.at(-1)?.id : undefined);
        setStatuses(existing => append
          ? [...existing, ...next.filter(item => !existing.some(old => old.id === item.id))]
          : next);
      } else {
        const offset = append ? sources.length : 0;
        const next = view === "find"
          ? await searchSources(ctx, search, offset)
          : await getSources(ctx, offset);
        setSources(existing => append
          ? [...existing, ...next.filter(item => !existing.some(old => old.id === item.id))]
          : next);
      }
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [ctx, loading, search, sources.length, statuses, view]);

  useEffect(() => {
    if (!ctx?.login) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      if (view === "find") {
        setSources([]);
        setLoading(false);
        return;
      }
      const promise = view === "timeline"
        ? getSourcesTimeline(ctx)
        : getSources(ctx);

      void promise
        .then(next => {
          if (!active) return;
          if (view === "timeline") setStatuses(next as UnfathomablyStatus[]);
          else setSources(next as UnfathomablySource[]);
        })
        .catch(reason => {
          if (active) setError(getErrorMessage(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ctx, view]);

  if (!ctx?.login) return <SuggestLogin />;

  async function toggleSource(source: UnfathomablySource) {
    if (savingId) return;
    setSavingId(source.id);
    try {
      const relationship = await setSourceFollowed(
        ctx as LotideContext,
        source.id,
        source.relationship?.following !== true,
      );
      setSources(existing => existing.map(item =>
        item.id === source.id ? { ...item, relationship } : item,
      ));
    } catch (reason) {
      Alert.alert("Could not update this feed", getErrorMessage(reason));
    } finally {
      setSavingId(undefined);
    }
  }

  const header = (
    <View style={[styles.header, { borderColor: theme.tertiaryBackground }]}>
      <View style={styles.tabs}>
        {(["timeline", "following", "find"] as SourcesView[]).map(tab => (
          <Pressable
            accessibilityLabel={tab === "timeline" ? "Feed" : tab === "following" ? "Following" : "Find"}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === tab }}
            key={tab}
            onPress={() => setView(tab)}
            style={[styles.tab, view === tab && { backgroundColor: theme.tint }]}
          >
            <Icon
              name={tab === "timeline" ? "list-outline" : tab === "following" ? "checkmark-circle-outline" : "search-outline"}
              color={view === tab ? theme.background : theme.text}
              size={19}
            />
            <Text style={view === tab ? { color: theme.background } : undefined}>
              {tab === "timeline" ? "Feed" : tab === "following" ? "Following" : "Find"}
            </Text>
          </Pressable>
        ))}
      </View>
      {view === "find" ? (
        <View style={styles.searchRow}>
          <TextInput
            onChangeText={setSearch}
            onSubmitEditing={() => { void load(); }}
            placeholder="Find a feed, publication, or creator"
            returnKeyType="search"
            style={styles.search}
            value={search}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search feeds"
            onPress={() => { void load(); }}
            style={[styles.searchButton, { backgroundColor: theme.tint }]}
          >
            <Icon name="search-outline" color={theme.background} size={23} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (view === "timeline") {
    return (
      <View style={styles.root}>
        <FlatList
          data={statuses}
          keyExtractor={status => status.id}
          ListHeaderComponent={header}
          ListEmptyComponent={error
            ? <RetryState message={error} onRetry={() => { void load(); }} />
            : loading ? null : <Text style={styles.empty}>Follow a source to build this feed.</Text>}
          onEndReached={() => { void load(true); }}
          onEndReachedThreshold={0.7}
          onRefresh={() => { void load(); }}
          refreshing={loading && statuses.length === 0}
          renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={sources}
        keyExtractor={source => source.id}
        ListHeaderComponent={header}
        ListEmptyComponent={error
          ? <RetryState message={error} onRetry={() => { void load(); }} />
          : loading ? null : <Text style={styles.empty}>{view === "find" ? "Search for a feed to follow." : "You are not following any sources yet."}</Text>}
        onEndReached={() => { void load(true); }}
        onEndReachedThreshold={0.7}
        onRefresh={() => { void load(); }}
        refreshing={loading && sources.length === 0}
        renderItem={({ item }) => (
          <SourceCard
            source={item}
            onOpen={() => navigation.navigate("Source", { sourceId: item.id, title: item.display_name })}
            onToggleFollow={() => { void toggleSource(item); }}
            saving={savingId === item.id}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, gap: 10, padding: 12 },
  tabs: { flexDirection: "row", gap: 7 },
  tab: { alignItems: "center", borderRadius: 9, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 48, paddingHorizontal: 6 },
  searchRow: { flexDirection: "row", gap: 8 },
  search: { flex: 1, minHeight: 48 },
  searchButton: { alignItems: "center", borderRadius: 9, justifyContent: "center", width: 52 },
  empty: { padding: 30, textAlign: "center" },
});

/* end of UnfathomablySourcesScreen.tsx */
