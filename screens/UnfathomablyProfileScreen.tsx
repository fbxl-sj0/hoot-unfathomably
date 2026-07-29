/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyProfileScreen.tsx

    Purpose:

        Show the signed-in account and its status feed.
*/

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";
import Icon from "@expo/vector-icons/Ionicons";
import { useDispatch } from "react-redux";

import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import RetryState from "../components/RetryState";
import { Text, View } from "../components/Themed";
import * as StorageService from "../services/StorageService";
import { setCtx } from "../slices/lotideSlice";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";

export default function UnfathomablyProfileScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const dispatch = useDispatch();
  const [statuses, setStatuses] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [error, setError] = useState("");
  const account = ctx?.login?.user as unknown as Unfathomably.UnfathomablyAccount | undefined;
  const load = useCallback(async () => { if (!ctx?.login || !account?.id) return; try { setError(""); setStatuses(await Unfathomably.getAccountStatuses(ctx, String(account.id))); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your posts."); } }, [account, ctx]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!ctx?.login || !account) return <SuggestLogin />;
  async function logout() { await StorageService.lotideContextKV.logout(ctx as LotideContext); await StorageService.lotideContext.remove(); dispatch(setCtx({})); }
  return <FlatList data={statuses} keyExtractor={item => item.id} renderItem={({ item }) => <StatusCard status={item} ctx={ctx} navigation={navigation} />} onRefresh={() => void load()} refreshing={false} ListHeaderComponent={<View style={styles.header}><View style={styles.identity}>{!!account.avatar && <Image source={{ uri: account.avatar }} style={styles.avatar} />}<View style={{ flex: 1 }}><Text style={styles.name}>{account.display_name || account.username}</Text><Text secondary>@{account.acct}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => void logout()}><Icon name="log-out-outline" size={25} /></Pressable></View><Text>{stripHtml(account.note || "")}</Text></View>} ListEmptyComponent={error ? <RetryState message={error} onRetry={() => void load()} /> : <Text style={styles.empty}>You have not posted yet.</Text>} />;
}
function stripHtml(value: string) { return value.replace(/<[^>]*>/g, "").trim(); }
const styles = StyleSheet.create({ header: { padding: 16, gap: 12 }, identity: { flexDirection: "row", alignItems: "center", gap: 12 }, avatar: { height: 65, width: 65, borderRadius: 33 }, name: { fontWeight: "700", fontSize: 21 }, empty: { padding: 30, textAlign: "center" } });

/* end of UnfathomablyProfileScreen.tsx */
