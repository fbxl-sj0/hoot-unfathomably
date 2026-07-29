/*
    Project: Hoot Mobile
    --------------------------

    File: GroupsScreen.tsx

    Purpose:

        Browse joined and discoverable Unfathomably groups.
*/

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { Text, TextInput, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";

export default function GroupsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const [groups, setGroups] = useState<Unfathomably.UnfathomablyGroup[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!ctx?.login) return;
    try { setError(""); setGroups(await Unfathomably.getGroups(ctx, search)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load groups."); }
  }, [ctx, search]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!ctx?.login) return <SuggestLogin />;
  return <View style={styles.root}>
    <TextInput placeholder="Find a group" value={search} onChangeText={setSearch} onSubmitEditing={() => void load()} style={styles.search} />
    <FlatList
      data={groups}
      keyExtractor={group => group.id}
      refreshing={false}
      onRefresh={() => void load()}
      ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void load()} /> : <Text style={styles.empty}>No groups found.</Text>}
      renderItem={({ item }) => <Pressable accessibilityLabel={`Open group ${item.display_name}`} accessibilityRole="button" style={styles.row} onPress={() => navigation.navigate("Group", { groupId: item.id, title: item.display_name })}>
        {!!item.avatar && <Image source={{ uri: item.avatar }} style={styles.avatar} />}
        <View style={styles.info}><Text style={styles.name}>{item.display_name}</Text><Text secondary numberOfLines={2}>{stripHtml(item.note) || "Group discussion"}</Text><Text secondary>{item.members_count} members</Text></View>
      </Pressable>}
    />
  </View>;
}

function stripHtml(value: string) { return value.replace(/<[^>]*>/g, "").trim(); }
const styles = StyleSheet.create({ root: { flex: 1 }, search: { margin: 12, padding: 10, borderRadius: 8 }, row: { flexDirection: "row", gap: 12, padding: 15, alignItems: "center" }, avatar: { width: 52, height: 52, borderRadius: 26 }, info: { flex: 1, gap: 3 }, name: { fontWeight: "700", fontSize: 17 }, empty: { padding: 30, textAlign: "center" } });

/* end of GroupsScreen.tsx */
