/*
    Project: Hoot Unfathomably
    --------------------------

    File: GroupsScreen.tsx

    Purpose:

        Browse joined and discoverable Unfathomably groups.

    Responsibilities:

        - Separate joined groups, curated discovery, and explicit search
        - Show server-owned platform and relationship labels
        - Open group detail without mutating membership

    This file intentionally does NOT contain:

        - group membership actions
        - group status rendering
        - remote community discovery requests
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { Text, TextInput, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useTheme from "../hooks/useTheme";
import * as Unfathomably from "../services/UnfathomablyService";

type GroupsView = "joined" | "discover" | "find";

export default function GroupsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [groups, setGroups] = useState<Unfathomably.UnfathomablyGroup[]>([]);
  const [view, setView] = useState<GroupsView>("joined");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!ctx?.login) return;
    try {
      setError("");
      const next = view === "discover"
        ? await Unfathomably.getDiscoverableGroups(ctx)
        : await Unfathomably.getGroups(ctx, view === "find" ? search : "");
      setGroups(view === "joined"
        ? next.filter(group => group.relationship?.member === true)
        : next);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load groups."); }
  }, [ctx, search, view]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!ctx?.login) return <SuggestLogin />;
  return <View style={styles.root}>
    <View style={[styles.tabs, { borderColor: theme.tertiaryBackground }]}>
      {(["joined", "discover", "find"] as GroupsView[]).map(tab => <Pressable accessibilityLabel={tab === "joined" ? "Joined" : tab === "discover" ? "Discover" : "Find"} accessibilityRole="tab" accessibilityState={{ selected: view === tab }} key={tab} onPress={() => setView(tab)} style={[styles.tab, view === tab && { backgroundColor: theme.tint }]}><Icon name={tab === "joined" ? "checkmark-circle-outline" : tab === "discover" ? "compass-outline" : "search-outline"} color={view === tab ? theme.onTint : theme.text} size={19} /><Text style={view === tab ? { color: theme.onTint } : undefined}>{tab === "joined" ? "Joined" : tab === "discover" ? "Discover" : "Find"}</Text></Pressable>)}
    </View>
    {view === "find" ? <TextInput placeholder="Find a group" value={search} onChangeText={setSearch} onSubmitEditing={() => void load()} style={styles.search} /> : null}
    <FlatList
      data={groups}
      keyExtractor={group => group.id}
      refreshing={false}
      onRefresh={() => void load()}
      ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void load()} /> : <Text style={styles.empty}>No groups found.</Text>}
      renderItem={({ item }) => <Pressable accessibilityLabel={`Open group ${item.display_name}`} accessibilityRole="button" style={styles.row} onPress={() => navigation.navigate("Group", { groupId: item.id, title: item.display_name })}>
        {!!item.avatar && <Image source={{ uri: item.avatar }} style={styles.avatar} />}
        <View style={styles.info}><Text style={styles.name}>{item.display_name}</Text><Text secondary numberOfLines={1}>{item.platform_label || item.target_kind_label || "Federated group"}</Text><Text secondary numberOfLines={2}>{stripHtml(item.note) || "Group discussion"}</Text><Text secondary>{item.members_count} members</Text>{typeof item.statuses_count === "number" ? <Text secondary>{item.statuses_count} posts</Text> : null}{item.relationship?.member ? <Text tint>{item.relationship.role || "member"}</Text> : null}</View>
      </Pressable>}
    />
  </View>;
}

function stripHtml(value: string) { return value.replace(/<[^>]*>/g, "").trim(); }
const styles = StyleSheet.create({ root: { flex: 1 }, tabs: { borderBottomWidth: 1, flexDirection: "row", gap: 7, padding: 12 }, tab: { alignItems: "center", borderRadius: 9, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 48, paddingHorizontal: 5 }, search: { margin: 12, minHeight: 48, padding: 10, borderRadius: 8 }, row: { flexDirection: "row", gap: 12, padding: 15, alignItems: "center" }, avatar: { width: 52, height: 52, borderRadius: 26 }, info: { flex: 1, gap: 3 }, name: { fontWeight: "700", fontSize: 17 }, empty: { padding: 30, textAlign: "center" } });

/* end of GroupsScreen.tsx */
