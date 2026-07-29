/*
    Project: Hoot Mobile
    --------------------------

    File: OptionsScreen.tsx

    Purpose:

        Provide account and app options without crowding the main feed tabs.
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import type { UnfathomablyAccount } from "../services/UnfathomablyService";

export default function OptionsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const account = ctx?.login?.user as unknown as UnfathomablyAccount | undefined;

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
    <Pressable accessibilityRole="button" accessibilityLabel="Open app settings" onPress={() => navigation.navigate("Settings")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="settings-outline" size={25} color={theme.text} />
      <Text style={styles.optionText}>App settings</Text>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, padding: 16, gap: 12 }, account: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }, avatar: { width: 58, height: 58, borderRadius: 29 }, name: { fontSize: 20, fontWeight: "700" }, option: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 14, minHeight: 56, paddingVertical: 10 }, optionText: { flex: 1, fontSize: 17 } });

/* end of OptionsScreen.tsx */
