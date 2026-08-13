/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyProfileScreen.tsx

    Purpose:

        Show the signed-in account and its live status feed.

    Responsibilities:

        - Present the active profile and account timeline
        - Apply live updates for statuses authored by the active account
        - Open profile editing and perform an explicit local logout

    This file intentionally does NOT contain:

        - profile update forms
        - status rendering details
        - authentication protocol requests
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";
import { useDispatch } from "react-redux";

import AppButton from "../components/AppButton";
import RetryState from "../components/RetryState";
import StatusCard, { stripHtml } from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useUnfathomablyStream from "../hooks/useUnfathomablyStream";
import * as StorageService from "../services/StorageService";
import * as Unfathomably from "../services/UnfathomablyService";
import { applyStatusStreamingEvent } from "../services/UnfathomablyStreamingService";
import { setCtx } from "../slices/lotideSlice";

export default function UnfathomablyProfileScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const dispatch = useDispatch();
  const [statuses, setStatuses] = useState<Unfathomably.UnfathomablyStatus[]>([]);
  const [error, setError] = useState("");
  const account = ctx?.login?.user as unknown as Unfathomably.UnfathomablyAccount | undefined;

  const load = useCallback(async () => {
    if (!ctx?.login || !account?.id) return;
    try {
      setError("");
      setStatuses(await Unfathomably.getAccountStatuses(ctx, String(account.id)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your posts.");
    }
  }, [account, ctx]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleStreamingEvent = useCallback((event: Parameters<typeof applyStatusStreamingEvent>[1]) => {
    setStatuses(current => applyStatusStreamingEvent(
      current,
      event,
      status => String(status.account.id) === String(account?.id),
    ));
  }, [account?.id]);

  useUnfathomablyStream(
    ctx,
    { stream: "user" },
    {
      onCatchUp: () => { void load(); },
      onEvent: handleStreamingEvent,
    },
  );

  if (!ctx?.login || !account) return <SuggestLogin />;

  async function logout() {
    await StorageService.lotideContextKV.logout(ctx as LotideContext);
    await StorageService.lotideContext.remove();
    dispatch(setCtx({}));
  }

  return (
    <FlatList
      data={statuses}
      keyExtractor={item => item.id}
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={styles.identity}>
            {account.avatar ? (
              <Image source={{ uri: account.avatar }} style={styles.avatar} />
            ) : (
              <Icon name="person-circle-outline" size={65} />
            )}
            <View style={styles.identityText}>
              <Text style={styles.name}>{account.display_name || account.username}</Text>
              <Text secondary>@{account.acct}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              onPress={() => void logout()}
              style={styles.iconAction}
            >
              <Icon name="log-out-outline" size={25} />
            </Pressable>
          </View>
          {account.note ? <Text>{stripHtml(account.note)}</Text> : null}
          <AppButton
            fullWidth
            onPress={() => navigation.navigate("EditProfile")}
            title="Edit profile"
          />
          <Text style={styles.postsTitle}>Your posts</Text>
        </View>
      )}
      ListEmptyComponent={error
        ? <RetryState message={error} onRetry={() => void load()} />
        : <Text style={styles.empty}>You have not posted yet.</Text>}
      onRefresh={() => void load()}
      refreshing={false}
      renderItem={({ item }) => (
        <StatusCard status={item} ctx={ctx} navigation={navigation} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, padding: 16 },
  identity: { alignItems: "center", flexDirection: "row", gap: 12 },
  identityText: { flex: 1 },
  avatar: { borderRadius: 33, height: 65, width: 65 },
  name: { fontSize: 21, fontWeight: "700" },
  iconAction: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  postsTitle: { fontSize: 19, fontWeight: "700", marginTop: 8 },
  empty: { padding: 30, textAlign: "center" },
});

/* end of UnfathomablyProfileScreen.tsx */
