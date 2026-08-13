/*
    Project: Hoot Unfathomably
    --------------------------

    File: FiltersScreen.tsx

    Purpose:

        Browse and manage server-side content filters.

    Responsibilities:

        - Load normalized v2 or legacy v1 filters
        - Explain filter action, contexts, keywords, and expiry
        - Open filter creation and editing

    This file intentionally does NOT contain:

        - filtered post presentation
        - filter API fallbacks
        - keyword editing controls
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
import {
  FediverseFilter,
  getFilters,
} from "../services/UnfathomablyFiltersService";
import { getErrorMessage } from "../utils/error";

export default function FiltersScreen({ navigation }: { navigation: any }) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [filters, setFilters] = useState<FediverseFilter[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setLoading(true);
    setError("");
    try {
      setFilters(await getFilters(ctx));
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
          Warn about or hide matching words in selected parts of the app.
        </Text>
        <AppButton
          onPress={() => navigation.navigate("FilterEditor")}
          title="Create filter"
        />
      </View>
      <FlatList
        data={filters}
        keyExtractor={filter => `${filter.apiVersion}:${filter.id}`}
        onRefresh={() => void load()}
        refreshing={loading}
        ListEmptyComponent={
          error ? (
            <RetryState message={error} onRetry={() => void load()} />
          ) : loading ? null : (
            <Text style={styles.empty}>No content filters are configured.</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`Edit filter ${item.title}`}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("FilterEditor", { filter: item })
            }
            style={[styles.row, { borderColor: theme.tertiaryBackground }]}
          >
            <Icon
              color={item.action === "hide" ? theme.red : theme.orange}
              name={
                item.action === "hide" ? "eye-off-outline" : "warning-outline"
              }
              size={25}
            />
            <View style={styles.body}>
              <Text style={styles.title}>{item.title}</Text>
              <Text secondary numberOfLines={2}>
                {item.keywords.map(keyword => keyword.keyword).join(", ")}
              </Text>
              <Text secondary>
                {item.action === "hide" ? "Hide" : "Warn"} ·{" "}
                {item.contexts.join(", ")}
                {item.expiresAt
                  ? ` · until ${new Date(item.expiresAt).toLocaleString()}`
                  : " · no expiry"}
              </Text>
            </View>
            <Icon
              name="chevron-forward-outline"
              color={theme.secondaryText}
              size={22}
            />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: { alignItems: "center", flexDirection: "row", gap: 12, padding: 16 },
  introText: { flex: 1, flexShrink: 1 },
  row: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 88,
    padding: 15,
  },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 17, fontWeight: "700" },
  empty: { padding: 30, textAlign: "center" },
});

/* end of FiltersScreen.tsx */
