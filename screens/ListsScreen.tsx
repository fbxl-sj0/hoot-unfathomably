/*
    Project: Hoot Unfathomably
    --------------------------

    File: ListsScreen.tsx

    Purpose:

        Browse and manage standard Fediverse account lists.

    Responsibilities:

        - Load lists whenever the screen gains focus
        - Open list timelines and membership management
        - Start list creation or editing

    This file intentionally does NOT contain:

        - list timeline rendering
        - account search
        - list API request construction
*/

import Icon from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { FediverseList, getLists } from "../services/UnfathomablyListsService";
import { getErrorMessage } from "../utils/error";

export default function ListsScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [lists, setLists] = useState<FediverseList[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setLoading(true);
    setError("");
    try {
      setLists(await getLists(ctx));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return undefined;
    }, [load]),
  );

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text secondary style={styles.introText}>
          Lists create focused timelines from accounts you follow.
        </Text>
        <AppButton
          onPress={() => navigation.navigate("ListEditor")}
          title="Create list"
        />
      </View>
      <FlatList
        data={lists}
        keyExtractor={list => list.id}
        onRefresh={() => void load()}
        refreshing={loading}
        ListEmptyComponent={
          error ? (
            <RetryState message={error} onRetry={() => void load()} />
          ) : loading ? null : (
            <Text style={styles.empty}>
              You have not created any lists yet.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: theme.tertiaryBackground }]}>
            <Pressable
              accessibilityLabel={`Open list ${item.title}`}
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate("ListDetail", {
                  listId: item.id,
                  title: item.title,
                })
              }
              style={styles.body}
            >
              <Icon name="list-outline" color={theme.tint} size={25} />
              <View style={styles.text}>
                <Text style={styles.title}>{item.title}</Text>
                <Text secondary>
                  Replies: {item.replies_policy || "list"}
                  {item.exclusive ? " · Exclusive" : ""}
                </Text>
              </View>
              <Icon
                name="chevron-forward-outline"
                color={theme.secondaryText}
                size={22}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={`Edit list ${item.title}`}
              accessibilityRole="button"
              onPress={() => navigation.navigate("ListEditor", { list: item })}
              style={styles.edit}
            >
              <Icon
                name="pencil-outline"
                color={theme.secondaryText}
                size={22}
              />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: { alignItems: "center", flexDirection: "row", gap: 12, padding: 16 },
  introText: { flex: 1, flexShrink: 1 },
  row: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row" },
  body: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingLeft: 16,
  },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 17, fontWeight: "700" },
  edit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    minWidth: 56,
  },
  empty: { padding: 30, textAlign: "center" },
});

/* end of ListsScreen.tsx */
