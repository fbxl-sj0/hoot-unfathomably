/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeAccountPicker.tsx

    Purpose:

        Select one or more authenticated accounts for a portable new post.

    Responsibilities:

        - Present saved account identity and server together
        - Keep at least one destination selected
        - Expose checkbox state to assistive technology

    This file intentionally does NOT contain:

        - saved credential access
        - publishing requests
        - reply, quote, or group target resolution
*/

import React from "react";
import { Image, Pressable, ScrollView, StyleSheet } from "react-native";

import { Text, View } from "./Themed";
import useTheme from "../hooks/useTheme";
import type { SavedAuthenticatedAccount } from "../services/SavedAccountService";

export default function ComposeAccountPicker({
  accounts,
  label = "Post from",
  onChange,
  selectedKeys,
  summary,
}: {
  accounts: SavedAuthenticatedAccount[];
  label?: string;
  onChange: (keys: string[]) => void;
  selectedKeys: string[];
  summary?: string;
}) {
  const theme = useTheme();

  if (accounts.length < 2) return null;

  function toggle(key: string) {
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length === 1) return;
      onChange(selectedKeys.filter(item => item !== key));
      return;
    }

    onChange([...selectedKeys, key]);
  }

  return (
    <View style={styles.root}>
      <Text secondary>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.accounts}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {accounts.map(item => {
          const selected = selectedKeys.includes(item.key);
          const host = new URL(item.context.apiUrl || item.account.url).host;

          return (
            <Pressable
              accessibilityLabel={`${selected ? "Remove" : "Add"} ${item.account.acct} on ${host}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              key={item.key}
              onPress={() => toggle(item.key)}
              style={[
                styles.account,
                { borderColor: selected ? theme.tint : theme.tertiaryBackground },
                selected && { backgroundColor: theme.secondaryBackground },
              ]}
            >
              {item.account.avatar ? (
                <Image source={{ uri: item.account.avatar }} style={styles.avatar} />
              ) : null}
              <View style={styles.identity}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.account.display_name || item.account.username}
                </Text>
                <Text numberOfLines={1} secondary>@{item.account.acct}</Text>
                <Text numberOfLines={1} secondary>{host}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {selectedKeys.length > 1 ? (
        <Text secondary>
          {summary || `This action will run separately from ${selectedKeys.length} accounts.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 7,
  },
  accounts: {
    gap: 9,
  },
  account: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: "row",
    gap: 9,
    minHeight: 64,
    padding: 9,
    width: 220,
  },
  avatar: {
    borderRadius: 21,
    height: 42,
    width: 42,
  },
  identity: {
    flex: 1,
  },
  name: {
    fontWeight: "700",
  },
});

/* end of ComposeAccountPicker.tsx */
