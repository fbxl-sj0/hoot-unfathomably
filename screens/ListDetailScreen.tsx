/*
    Project: Hoot Unfathomably
    --------------------------

    File: ListDetailScreen.tsx

    Purpose:

        Read a list timeline and manage the accounts that populate it.

    Responsibilities:

        - Cache and paginate the list timeline for offline reading
        - List and remove current members
        - Search through the home server and add selected accounts

    This file intentionally does NOT contain:

        - list metadata editing
        - direct remote-server requests
        - home timeline filtering
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet } from "react-native";

import RetryState from "../components/RetryState";
import StatusCard from "../components/StatusCard";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { offlineTimelines } from "../services/OfflineCacheService";
import * as Accounts from "../services/UnfathomablyAccountService";
import {
  addAccountsToList,
  getListAccounts,
  getListTimeline,
  removeAccountsFromList,
} from "../services/UnfathomablyListsService";
import type {
  UnfathomablyAccount,
  UnfathomablyStatus,
} from "../services/UnfathomablyService";
import { getErrorMessage } from "../utils/error";

type ListView = "add" | "members" | "posts";

export default function ListDetailScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params: { listId: string; title: string } };
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const { listId } = route.params;
  const [view, setView] = useState<ListView>("posts");
  const [statuses, setStatuses] = useState<UnfathomablyStatus[]>([]);
  const [accounts, setAccounts] = useState<UnfathomablyAccount[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UnfathomablyAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offlineStoredAt, setOfflineStoredAt] = useState<number>();
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!ctx?.login || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      if (view === "posts") {
        const cached = await offlineTimelines.query(ctx, `list:${listId}`);
        if (cached && statuses.length === 0) {
          setStatuses(cached.items);
          setOfflineStoredAt(cached.storedAt);
        }
        const next = await getListTimeline(ctx, listId);
        setStatuses(next);
        setOfflineStoredAt(undefined);
        void offlineTimelines.store(ctx, `list:${listId}`, next).catch(() => undefined);
      } else if (view === "members") {
        setAccounts(await getListAccounts(ctx, listId));
      }
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [ctx, listId, statuses.length, view]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!ctx?.login) return <SuggestLogin />;

  async function findAccounts() {
    if (!search.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      setSearchResults(await Accounts.searchAccounts(ctx!, search));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  async function add(account: UnfathomablyAccount) {
    try {
      await addAccountsToList(ctx!, listId, [account.id]);
      setSearchResults(current => current.filter(item => item.id !== account.id));
      setAccounts(current => current.some(item => item.id === account.id)
        ? current
        : [...current, account]);
    } catch (reason) {
      Alert.alert("Could not add account", getErrorMessage(reason));
    }
  }

  async function remove(account: UnfathomablyAccount) {
    try {
      await removeAccountsFromList(ctx!, listId, [account.id]);
      setAccounts(current => current.filter(item => item.id !== account.id));
    } catch (reason) {
      Alert.alert("Could not remove account", getErrorMessage(reason));
    }
  }

  const shownAccounts = view === "add" ? searchResults : accounts;
  return (
    <View style={styles.root}>
      <View style={[styles.tabs, { borderColor: theme.tertiaryBackground }]}>
        {(["posts", "members", "add"] as const).map(tab => (
          <Pressable
            accessibilityLabel={tab === "posts" ? "Posts" : tab === "members" ? "Members" : "Add people"}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === tab }}
            key={tab}
            onPress={() => {
              setView(tab);
              setError("");
            }}
            style={[styles.tab, view === tab && { backgroundColor: theme.tint }]}
          >
            <Icon
              color={view === tab ? theme.onTint : theme.text}
              name={tab === "posts" ? "newspaper-outline" : tab === "members" ? "people-outline" : "person-add-outline"}
              size={20}
            />
            <Text style={view === tab ? { color: theme.onTint } : undefined}>
              {tab === "posts" ? "Posts" : tab === "members" ? "Members" : "Add"}
            </Text>
          </Pressable>
        ))}
      </View>
      {view === "add" ? (
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="List account search"
            autoCapitalize="none"
            onChangeText={setSearch}
            onSubmitEditing={() => void findAccounts()}
            placeholder="Name or @user@server"
            style={styles.searchInput}
            value={search}
          />
          <Pressable
            accessibilityLabel="Search for an account to add"
            accessibilityRole="button"
            onPress={() => void findAccounts()}
            style={[styles.searchButton, { backgroundColor: theme.tint }]}
          >
            <Icon name="search-outline" color={theme.onTint} size={22} />
          </Pressable>
        </View>
      ) : null}
      {offlineStoredAt !== undefined && view === "posts" ? (
        <Text secondary style={styles.offlineNotice}>
          Offline copy saved {new Date(offlineStoredAt).toLocaleString()}
        </Text>
      ) : null}
      <FlatList<UnfathomablyStatus | UnfathomablyAccount>
        data={view === "posts" ? statuses : shownAccounts}
        keyExtractor={item => item.id}
        onRefresh={() => void load()}
        refreshing={loading}
        ListEmptyComponent={error ? (
          <RetryState message={error} onRetry={() => void load()} />
        ) : loading ? null : (
          <Text style={styles.empty}>
            {view === "posts" ? "No posts in this list yet." : view === "members" ? "No accounts in this list." : "Search for an account to add."}
          </Text>
        )}
        renderItem={({ item }) => "content" in item ? (
          <StatusCard
            ctx={ctx}
            navigation={navigation}
            status={item}
          />
        ) : (
          <AccountListRow
            account={item}
            action={view === "add" ? "add" : "remove"}
            onPress={() => void (view === "add"
              ? add(item)
              : remove(item))}
          />
        )}
      />
    </View>
  );
}

function AccountListRow({
  account,
  action,
  onPress,
}: {
  account: UnfathomablyAccount;
  action: "add" | "remove";
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.accountRow, { borderColor: theme.tertiaryBackground }]}>
      {account.avatar ? <Image source={{ uri: account.avatar }} style={styles.avatar} /> : null}
      <View style={styles.accountText}>
        <Text style={styles.accountName}>{account.display_name || account.username}</Text>
        <Text secondary>@{account.acct}</Text>
      </View>
      <Pressable
        accessibilityLabel={`${action === "add" ? "Add" : "Remove"} ${account.acct} ${action === "add" ? "to" : "from"} list`}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.memberAction}
      >
        <Icon
          color={action === "add" ? theme.tint : theme.red}
          name={action === "add" ? "add-circle-outline" : "remove-circle-outline"}
          size={26}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { borderBottomWidth: 1, flexDirection: "row", gap: 7, padding: 10 },
  tab: { alignItems: "center", borderRadius: 20, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 44 },
  searchRow: { flexDirection: "row", gap: 8, padding: 12 },
  searchInput: { flex: 1, minHeight: 48 },
  searchButton: { alignItems: "center", borderRadius: 9, justifyContent: "center", minHeight: 48, minWidth: 48 },
  offlineNotice: { paddingHorizontal: 16, paddingVertical: 8 },
  empty: { padding: 30, textAlign: "center" },
  accountRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 11, minHeight: 70, paddingLeft: 15 },
  avatar: { borderRadius: 22, height: 44, width: 44 },
  accountText: { flex: 1 },
  accountName: { fontSize: 16, fontWeight: "700" },
  memberAction: { alignItems: "center", justifyContent: "center", minHeight: 56, minWidth: 56 },
});

/* end of ListDetailScreen.tsx */
