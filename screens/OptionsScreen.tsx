/*
    Project: Hoot Unfathomably
    --------------------------

    File: OptionsScreen.tsx

    Purpose:

        Provide account and app options without crowding the main feed tabs.

    Responsibilities:

        - Link to the signed-in profile and app settings
        - Expose Worlds and feeds when the current server advertises them
        - Keep optional server extensions out of the fixed bottom navigation

    This file intentionally does NOT contain:

        - instance capability inference beyond the server feature manifest
        - Worlds, feed, profile, or settings presentation
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  getInstance,
  getInstanceCapabilities,
  InstanceCapabilities,
  UnfathomablyAccount,
} from "../services/UnfathomablyService";

const NO_EXTENSIONS: InstanceCapabilities = {
  dislikes: false,
  emojiReactions: false,
  events: false,
  groupedNotifications: false,
  groupDiscovery: false,
  groupSearch: false,
  groups: false,
  quotes: false,
  sources: false,
  worlds: false,
};

export default function OptionsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const account = ctx?.login?.user as unknown as UnfathomablyAccount | undefined;
  const [capabilities, setCapabilities] = useState(NO_EXTENSIONS);

  useEffect(() => {
    if (!ctx?.apiUrl) return;
    let active = true;
    void getInstance(ctx.apiUrl)
      .then(instance => {
        if (active) setCapabilities(getInstanceCapabilities(instance));
      })
      .catch(() => {
        if (active) setCapabilities(NO_EXTENSIONS);
      });
    return () => { active = false; };
  }, [ctx?.apiUrl]);

  if (!ctx?.login || !account) return <SuggestLogin />;

  return <View style={styles.root}>
    <View style={styles.account}>
      {!!account.avatar && <Image source={{ uri: account.avatar }} style={styles.avatar} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{account.display_name || account.username}</Text>
        <Text secondary>@{account.acct}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open your profile and posts" onPress={() => navigation.navigate("AccountProfile")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="person-circle-outline" size={25} color={theme.text} />
      <Text style={styles.optionText}>Your profile and posts</Text>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    {capabilities.worlds ? <Pressable accessibilityRole="button" accessibilityLabel="Explore Unfathomably Worlds" onPress={() => navigation.navigate("Worlds")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="planet-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>Worlds</Text><Text secondary>Books, media, events, software, communities, and more</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable> : null}
    {capabilities.sources ? <Pressable accessibilityRole="button" accessibilityLabel="Open followed feeds and sources" onPress={() => navigation.navigate("Sources")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="newspaper-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>Feeds and sources</Text><Text secondary>Follow publications and federated feeds</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Open app settings" onPress={() => navigation.navigate("Settings")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="settings-outline" size={25} color={theme.text} />
      <Text style={styles.optionText}>App settings</Text>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, padding: 16, gap: 12 }, account: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }, avatar: { width: 58, height: 58, borderRadius: 29 }, name: { fontSize: 20, fontWeight: "700" }, option: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 14, minHeight: 56, paddingVertical: 10 }, optionBody: { flex: 1, gap: 2 }, optionText: { fontSize: 17 } });

/* end of OptionsScreen.tsx */
