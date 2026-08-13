/*
    Project: Hoot Unfathomably
    --------------------------

    File: AccountRow.tsx

    Purpose:

        Render a compact, reusable Fediverse account result.

    Responsibilities:

        - Show the account avatar, display name, address, and short biography
        - Provide one finger-sized navigation target for account lists

    This file intentionally does NOT contain:

        - Relationship mutations
        - Account loading or pagination
        - Screen navigation policy
*/

import Icon from "@expo/vector-icons/Ionicons";
import React from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import { stripHtml } from "./StatusCard";
import { Text, View } from "./Themed";
import useTheme from "../hooks/useTheme";
import type { UnfathomablyAccount } from "../services/UnfathomablyService";

export default function AccountRow({
  account,
  onPress,
}: {
  account: UnfathomablyAccount;
  onPress: () => void;
}) {
  const theme = useTheme();
  const displayName = account.display_name || account.username || account.acct;
  const description = stripHtml(account.note || "");

  return (
    <Pressable
      accessibilityLabel={`Open profile for ${displayName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.secondaryBackground, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {account.avatar ? (
        <Image source={{ uri: account.avatar }} style={styles.avatar} />
      ) : (
        <View
          style={[
            styles.avatar,
            styles.avatarFallback,
            { backgroundColor: theme.secondaryBackground },
          ]}
        >
          <Icon name="person-outline" size={25} color={theme.secondaryText} />
        </View>
      )}
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>
          {displayName}
          {account.bot ? <Text secondary> bot</Text> : null}
        </Text>
        <Text numberOfLines={1} secondary>
          @{account.acct}
        </Text>
        {description ? (
          <Text numberOfLines={2} secondary style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward-outline" size={21} color={theme.secondaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  body: { backgroundColor: "transparent", flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "700" },
  description: { marginTop: 2 },
});

/* end of AccountRow.tsx */
