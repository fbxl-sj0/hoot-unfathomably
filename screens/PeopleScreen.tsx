/*
    Project: Hoot Unfathomably
    --------------------------

    File: PeopleScreen.tsx

    Purpose:

        Find Fediverse accounts and manage incoming follow requests.

    Responsibilities:

        - Search local and remote accounts through the selected server
        - Open search results in the relationship-aware account screen
        - Accept or decline incoming follow requests explicitly

    This file intentionally does NOT contain:

        - Direct requests to remote instances
        - Account relationship presentation
        - Group discovery
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";

import AccountRow from "../components/AccountRow";
import AppButton from "../components/AppButton";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Accounts from "../services/UnfathomablyAccountService";
import type { UnfathomablyAccount } from "../services/UnfathomablyService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

type PeopleView = "find" | "requests";

export default function PeopleScreen({
  navigation,
}: RootStackScreenProps<"People">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [view, setView] = useState<PeopleView>("find");
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<UnfathomablyAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const requestPendingRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      requestPendingRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  const loadRequests = useCallback(async () => {
    if (!ctx?.login) return;

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const next = await Accounts.getFollowRequests(ctx);
      if (!isMountedRef.current || requestSequenceRef.current !== requestId) return;
      setAccounts(next);
    } catch (reason) {
      if (isMountedRef.current && requestSequenceRef.current === requestId) {
        setError(getErrorMessage(reason));
      }
    } finally {
      if (isMountedRef.current && requestSequenceRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [ctx]);

  useEffect(() => {
    if (view !== "requests") return;

    const timer = setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRequests, view]);

  async function findAccounts() {
    if (!ctx?.login || loading) return;

    const normalized = search.trim();
    if (!normalized) {
      setAccounts([]);
      setError("Enter a name or full @user@server address.");
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const next = await Accounts.searchAccounts(ctx, normalized);
      if (!isMountedRef.current || requestSequenceRef.current !== requestId) return;
      setAccounts(next);
    } catch (reason) {
      if (isMountedRef.current && requestSequenceRef.current === requestId) {
        setError(getErrorMessage(reason));
      }
    } finally {
      if (isMountedRef.current && requestSequenceRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function decideRequest(account: UnfathomablyAccount, accept: boolean) {
    if (!ctx?.login || requestPendingRef.current) return;

    requestPendingRef.current = true;
    setPendingRequestId(account.id);
    try {
      await Accounts.resolveFollowRequest(ctx, account.id, accept);
      if (!isMountedRef.current) return;
      setAccounts(current => current.filter(item => item.id !== account.id));
    } catch (reason) {
      if (isMountedRef.current) {
        Alert.alert(
          accept ? "Could not accept follow request" : "Could not decline follow request",
          getErrorMessage(reason),
        );
      }
    } finally {
      requestPendingRef.current = false;
      if (isMountedRef.current) setPendingRequestId(undefined);
    }
  }

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <View style={styles.root}>
      <View style={[styles.tabs, { borderColor: theme.tertiaryBackground }]}>
        <PeopleTab
          icon="search-outline"
          label="Find people"
          selected={view === "find"}
          onPress={() => {
            requestSequenceRef.current += 1;
            setView("find");
            setAccounts([]);
            setError("");
          }}
        />
        <PeopleTab
          icon="person-add-outline"
          label="Follow requests"
          selected={view === "requests"}
          onPress={() => {
            requestSequenceRef.current += 1;
            setView("requests");
            setAccounts([]);
            setError("");
          }}
        />
      </View>
      {view === "find" ? (
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="People search query"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearch}
            onSubmitEditing={() => void findAccounts()}
            placeholder="Name or @user@server"
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          <Pressable
            accessibilityLabel="Search for people"
            accessibilityRole="button"
            disabled={loading}
            onPress={() => void findAccounts()}
            style={[styles.searchButton, { backgroundColor: theme.tint }]}
          >
            <Icon name="search-outline" size={23} color={theme.onTint} />
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={accounts}
        keyExtractor={account => account.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          error ? (
            <RetryState
              message={error}
              onRetry={() => void (view === "find" ? findAccounts() : loadRequests())}
            />
          ) : !loading ? (
            <Text style={styles.empty}>
              {view === "find"
                ? "Search for someone to view their profile and follow them."
                : "No pending follow requests."}
            </Text>
          ) : (
            <Text style={styles.empty}>Loading...</Text>
          )
        }
        onRefresh={() => void (view === "find" ? findAccounts() : loadRequests())}
        refreshing={loading}
        renderItem={({ item }) => (
          <View>
            <AccountRow
              account={item}
              onPress={() => navigation.navigate("Account", {
                account: item,
                accountId: item.id,
              })}
            />
            {view === "requests" ? (
              <View style={styles.requestActions}>
                <AppButton
                  title={pendingRequestId === item.id ? "Saving..." : "Accept"}
                  disabled={pendingRequestId !== undefined}
                  onPress={() => void decideRequest(item, true)}
                />
                <AppButton
                  title="Decline"
                  disabled={pendingRequestId !== undefined}
                  onPress={() => void decideRequest(item, false)}
                  color={theme.secondaryBackground}
                  textColor={theme.text}
                />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

function PeopleTab({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected && { backgroundColor: theme.tint }]}
    >
      <Icon name={icon} color={selected ? theme.onTint : theme.text} size={20} />
      <Text style={selected ? { color: theme.onTint } : undefined}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { borderBottomWidth: 1, flexDirection: "row", gap: 8, padding: 12 },
  tab: { alignItems: "center", borderRadius: 9, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 48, paddingHorizontal: 6 },
  searchRow: { alignItems: "center", flexDirection: "row", gap: 8, padding: 12 },
  searchInput: { flex: 1, minHeight: 48 },
  searchButton: { alignItems: "center", borderRadius: 9, height: 48, justifyContent: "center", width: 52 },
  requestActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", paddingBottom: 10, paddingHorizontal: 15 },
  empty: { padding: 30, textAlign: "center" },
});

/* end of PeopleScreen.tsx */
