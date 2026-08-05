/*
    Project: Hoot Mobile
    --------------------------

    File: GroupScreen.tsx

    Purpose:

        Read and participate in a group discussion.
*/

import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import StatusCard from "../components/StatusCard";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";
import { createComposeIntent } from "../utils/composeIntent";

export default function GroupScreen({ navigation, route }: { navigation: any; route: { params: { groupId: string; title?: string } } }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [statuses, setStatuses] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [group, setGroup] = useState<Unfathomably.UnfathomablyGroup>();
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const id = route.params.groupId;
  const load = useCallback(async () => {
    if (!ctx?.login) return;
    try {
      setError("");
      const [allGroups, posts] = await Promise.all([Unfathomably.getGroups(ctx), Unfathomably.getGroupStatuses(ctx, id)]);
      setGroup(allGroups.find(item => item.id === id));
      setStatuses(posts);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load this group."); }
  }, [ctx, id]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!ctx?.login) return null;
  const joined = !!group?.relationship?.member;
  async function toggleMembership() {
    setJoining(true);
    try { await Unfathomably.joinGroup(ctx as LotideContext, id, joined); await load(); }
    catch (reason) { Alert.alert("Could not update group membership", reason instanceof Error ? reason.message : "Try again."); }
    finally { setJoining(false); }
  }
  return <View style={styles.root}>
    <FlatList
      data={statuses}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />}
      onRefresh={() => void load()}
      refreshing={false}
      ListHeaderComponent={<View style={[styles.header, { borderBottomColor: theme.secondaryBackground }]}>
        {!!group?.header && <Image source={{ uri: group.header }} style={styles.cover} />}
        <View style={styles.groupInfo}><Text style={styles.title}>{group?.display_name || route.params.title || "Group"}</Text><Text secondary>{group?.members_count || 0} members</Text>{!!group?.note && <Text>{stripHtml(group.note)}</Text>}<View style={styles.buttons}><AppButton title={joining ? "Saving..." : joined ? "Leave group" : group?.relationship?.requested ? "Requested" : "Join group"} onPress={() => void toggleMembership()} disabled={joining || !!group?.relationship?.requested} color={theme.tint} /><Pressable accessibilityRole="button" style={styles.compose} onPress={() => navigation.navigate("Root", { screen: "NewPostScreen", params: createComposeIntent({ groupId: id, groupName: group?.display_name }) })}><Text style={{ color: theme.tint }}>Write to group</Text></Pressable></View></View>
      </View>}
      ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void load()} /> : <Text style={styles.empty}>No discussion posts yet.</Text>}
    />
  </View>;
}

function stripHtml(value: string) { return value.replace(/<[^>]*>/g, "").trim(); }
const styles = StyleSheet.create({ root: { flex: 1 }, header: { borderBottomWidth: 8 }, cover: { height: 130, width: "100%" }, groupInfo: { padding: 15, gap: 7 }, title: { fontSize: 24, fontWeight: "700" }, buttons: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 5 }, compose: { padding: 12 }, empty: { padding: 30, textAlign: "center" } });

/* end of GroupScreen.tsx */
