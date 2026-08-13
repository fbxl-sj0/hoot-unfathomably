/*
    Project: Hoot Unfathomably
    --------------------------

    File: OptionsScreen.tsx

    Purpose:

        Provide a More hub without crowding the main feed tabs.

    Responsibilities:

        - Link to the signed-in profile and app settings
        - Open drafts, scheduled posts, lists, and other daily workflows
        - Expose Worlds and feeds when the current server advertises them
        - Provide direct entry points for book and GPS route workflows
        - Keep optional server extensions out of the fixed bottom navigation

    This file intentionally does NOT contain:

        - instance capability inference beyond the server feature manifest
        - Worlds, feed, profile, or settings presentation
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet } from "react-native";

import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useI18n from "../hooks/useI18n";
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
  const { t } = useI18n();
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

  return <ScrollView
    contentContainerStyle={styles.root}
    style={{ backgroundColor: theme.background }}
  >
    <View style={styles.account}>
      {!!account.avatar && <Image source={{ uri: account.avatar }} style={styles.avatar} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{account.display_name || account.username}</Text>
        <Text secondary>@{account.acct}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open your profile and posts" onPress={() => navigation.navigate("AccountProfile")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="person-circle-outline" size={25} color={theme.text} />
      <Text style={styles.optionText}>{t("more.profile")}</Text>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Find people and manage follow requests" onPress={() => navigation.navigate("People")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="person-add-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.people")}</Text><Text secondary>{t("more.peopleDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open saved posts" onPress={() => navigation.navigate("SavedPosts")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="bookmark-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.savedPosts")}</Text><Text secondary>{t("more.savedDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open local post drafts" onPress={() => navigation.navigate("Drafts")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="document-text-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.drafts")}</Text><Text secondary>{t("more.draftsDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Manage scheduled posts" onPress={() => navigation.navigate("ScheduledPosts")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="time-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.scheduledPosts")}</Text><Text secondary>{t("more.scheduledDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Manage account lists" onPress={() => navigation.navigate("Lists")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="list-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.lists")}</Text><Text secondary>{t("more.listsDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Manage content filters" onPress={() => navigation.navigate("Filters")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="filter-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.contentFilters")}</Text><Text secondary>{t("more.filtersDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
    {capabilities.worlds ? <Pressable accessibilityRole="button" accessibilityLabel="Explore Unfathomably Worlds" onPress={() => navigation.navigate("Worlds")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="planet-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.worlds")}</Text><Text secondary>{t("more.worldsDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable> : null}
    {capabilities.worlds ? <Pressable accessibilityRole="button" accessibilityLabel="Manage your book library" onPress={() => navigation.navigate("BookLibrary")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="library-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.myBooks")}</Text><Text secondary>{t("more.booksDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable> : null}
    {capabilities.worlds ? <Pressable accessibilityRole="button" accessibilityLabel="Record or import a GPS path" onPress={() => navigation.navigate("RouteRecorder")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="navigate-circle-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("nav.gpsPaths")}</Text><Text secondary>{t("more.routesDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable> : null}
    {capabilities.sources ? <Pressable accessibilityRole="button" accessibilityLabel="Open followed feeds and sources" onPress={() => navigation.navigate("Sources")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="newspaper-outline" size={25} color={theme.text} />
      <View style={styles.optionBody}><Text style={styles.optionText}>{t("more.sources")}</Text><Text secondary>{t("more.sourcesDescription")}</Text></View>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Open app settings" onPress={() => navigation.navigate("Settings")} style={[styles.option, { borderColor: theme.secondaryBackground }]}>
      <Icon name="settings-outline" size={25} color={theme.text} />
      <Text style={styles.optionText}>{t("more.appSettings")}</Text>
      <Icon name="chevron-forward-outline" size={22} color={theme.secondaryText} />
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({ root: { flexGrow: 1, padding: 16, gap: 12 }, account: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }, avatar: { width: 58, height: 58, borderRadius: 29 }, name: { fontSize: 20, fontWeight: "700" }, option: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 14, minHeight: 56, paddingVertical: 10 }, optionBody: { flex: 1, gap: 2 }, optionText: { fontSize: 17 } });

/* end of OptionsScreen.tsx */
