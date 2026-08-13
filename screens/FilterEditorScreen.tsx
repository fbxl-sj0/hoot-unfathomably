/*
    Project: Hoot Unfathomably
    --------------------------

    File: FilterEditorScreen.tsx

    Purpose:

        Create or edit an advanced portable content filter.

    Responsibilities:

        - Edit title, action, contexts, expiry, and multiple keywords
        - Preserve per-keyword whole-word matching
        - Submit normalized v2 or legacy-compatible updates
        - Confirm deletion of an existing filter

    This file intentionally does NOT contain:

        - timeline matching
        - status rendering
        - filter API version detection
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import { SCROLL_FORM_BOTTOM_PADDING } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  createFilter,
  deleteFilter,
  FediverseFilter,
  FediverseFilterAction,
  FediverseFilterContext,
  FediverseFilterKeyword,
  updateFilter,
} from "../services/UnfathomablyFiltersService";
import { getErrorMessage } from "../utils/error";

const contexts: { label: string; value: FediverseFilterContext }[] = [
  { label: "Home and lists", value: "home" },
  { label: "Notifications", value: "notifications" },
  { label: "Public timelines", value: "public" },
  { label: "Discussions", value: "thread" },
  { label: "Profiles", value: "account" },
];

const expiryOptions = [
  { label: "Never", seconds: undefined },
  { label: "30 minutes", seconds: 1_800 },
  { label: "1 day", seconds: 86_400 },
  { label: "1 week", seconds: 604_800 },
  { label: "1 month", seconds: 2_592_000 },
] as const;

function currentExpiry(
  filter: FediverseFilter | undefined,
): number | undefined {
  if (!filter?.expiresAt) return undefined;
  const remaining = Math.max(
    60,
    Math.trunc((Date.parse(filter.expiresAt) - Date.now()) / 1_000),
  );
  return Number.isFinite(remaining) ? remaining : undefined;
}

export default function FilterEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { filter?: FediverseFilter } };
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const existing = route.params?.filter;
  const [title, setTitle] = useState(existing?.title || "");
  const [action, setAction] = useState<FediverseFilterAction>(
    existing?.action || "warn",
  );
  const [selectedContexts, setSelectedContexts] = useState<
    FediverseFilterContext[]
  >(existing?.contexts || ["home", "notifications"]);
  const [expiresIn, setExpiresIn] = useState<number | undefined>(() =>
    currentExpiry(existing),
  );
  const [keywords, setKeywords] = useState<FediverseFilterKeyword[]>(
    existing?.keywords.length
      ? existing.keywords
      : [{ keyword: "", wholeWord: false }],
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  if (!ctx?.login) return <SuggestLogin />;

  function updateKeyword(
    index: number,
    change: Partial<FediverseFilterKeyword>,
  ) {
    setKeywords(current =>
      current.map((keyword, keywordIndex) =>
        keywordIndex === index ? { ...keyword, ...change } : keyword,
      ),
    );
  }

  function toggleContext(context: FediverseFilterContext) {
    setSelectedContexts(current =>
      current.includes(context)
        ? current.length === 1
          ? current
          : current.filter(item => item !== context)
        : [...current, context],
    );
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const input = {
        action,
        contexts: selectedContexts,
        expiresIn,
        keywords,
        title,
      };
      if (existing) await updateFilter(ctx!, existing, input);
      else await createFilter(ctx!, input);
      navigation.goBack();
    } catch (reason) {
      Alert.alert("Could not save filter", getErrorMessage(reason));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert(
      `Delete ${existing.title}?`,
      "Matching posts will no longer be warned about or hidden.",
      [
        { text: "Keep filter", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteFilter(ctx!, existing)
              .then(() => navigation.goBack())
              .catch(reason =>
                Alert.alert("Could not delete filter", getErrorMessage(reason)),
              );
          },
        },
      ],
    );
  }

  const hasKeyword = keywords.some(keyword => keyword.keyword.trim());
  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      {existing?.apiVersion === 1 ? (
        <Text secondary>
          This server uses its legacy filter API. It supports one keyword per
          filter.
        </Text>
      ) : null}
      <Text secondary>Filter name</Text>
      <TextInput
        accessibilityLabel="Filter name"
        maxLength={200}
        onChangeText={setTitle}
        placeholder="Book spoilers, work topics…"
        style={styles.titleInput}
        value={title}
      />
      <Text secondary>When a post matches</Text>
      <View style={styles.choices}>
        {(["warn", "hide"] as const).map(value => (
          <Pressable
            accessibilityLabel={
              value === "warn" ? "Show a warning" : "Hide the post"
            }
            accessibilityRole="radio"
            accessibilityState={{ checked: action === value }}
            key={value}
            onPress={() => setAction(value)}
            style={[
              styles.choice,
              action === value && { backgroundColor: theme.tint },
            ]}
          >
            <Text
              style={action === value ? { color: theme.onTint } : undefined}
            >
              {value === "warn" ? "Show a warning" : "Hide completely"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text secondary>Apply in</Text>
      <View style={styles.choices}>
        {contexts.map(item => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: selectedContexts.includes(item.value),
            }}
            key={item.value}
            onPress={() => toggleContext(item.value)}
            style={[
              styles.choice,
              selectedContexts.includes(item.value) && {
                backgroundColor: theme.secondaryBackground,
              },
            ]}
          >
            <Text>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text secondary>Expires</Text>
      <View style={styles.choices}>
        {expiryOptions.map(option => (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: expiresIn === option.seconds }}
            key={option.label}
            onPress={() => setExpiresIn(option.seconds)}
            style={[
              styles.choice,
              expiresIn === option.seconds && { backgroundColor: theme.tint },
            ]}
          >
            <Text
              style={
                expiresIn === option.seconds
                  ? { color: theme.onTint }
                  : undefined
              }
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text secondary>Words or phrases</Text>
      {keywords.map((keyword, index) => (
        <View key={keyword.id || `new-${index}`} style={styles.keywordRow}>
          <TextInput
            accessibilityLabel={`Filter keyword ${index + 1}`}
            maxLength={500}
            onChangeText={value => updateKeyword(index, { keyword: value })}
            placeholder="Word or phrase"
            style={styles.keywordInput}
            value={keyword.keyword}
          />
          <Pressable
            accessibilityLabel={`Match keyword ${index + 1} as a whole word`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: keyword.wholeWord }}
            onPress={() =>
              updateKeyword(index, { wholeWord: !keyword.wholeWord })
            }
            style={styles.iconAction}
          >
            <Icon
              color={keyword.wholeWord ? theme.tint : theme.secondaryText}
              name="text-outline"
              size={23}
            />
          </Pressable>
          {keywords.length > 1 ? (
            <Pressable
              accessibilityLabel={`Remove filter keyword ${index + 1}`}
              accessibilityRole="button"
              onPress={() =>
                setKeywords(current =>
                  current.filter((_item, itemIndex) => itemIndex !== index),
                )
              }
              style={styles.iconAction}
            >
              <Icon color={theme.red} name="remove-circle-outline" size={24} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {existing?.apiVersion !== 1 && keywords.length < 40 ? (
        <AppButton
          color={theme.secondaryTint}
          onPress={() =>
            setKeywords(current => [
              ...current,
              { keyword: "", wholeWord: false },
            ])
          }
          title="Add another keyword"
        />
      ) : null}
      <AppButton
        disabled={!hasKeyword || saving}
        fullWidth
        onPress={() => void save()}
        title={
          saving ? "Saving..." : existing ? "Save filter" : "Create filter"
        }
      />
      {existing ? (
        <AppButton
          color={theme.red}
          fullWidth
          onPress={confirmDelete}
          title="Delete filter"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 13,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  titleInput: { fontSize: 17, minHeight: 48 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  keywordRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  keywordInput: { flex: 1, minHeight: 48 },
  iconAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
  },
});

/* end of FilterEditorScreen.tsx */
