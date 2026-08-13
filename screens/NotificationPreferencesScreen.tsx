/*
    Project: Hoot Unfathomably
    --------------------------

    File: NotificationPreferencesScreen.tsx

    Purpose:

        Configure account-scoped local notification delivery.

    Responsibilities:

        - Enable or silence categories of Fediverse activity
        - Choose individual alerts or one digest per background check
        - Control post previews and notification sound
        - Defer eligible alerts during local quiet hours

    This file intentionally does NOT contain:

        - Android permission management
        - background task registration
        - notification polling logic
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch } from "react-native";

import AppButton from "../components/AppButton";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import { SCROLL_FORM_BOTTOM_PADDING } from "../constants/TouchTargets";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  NotificationCategory,
  NotificationDeliveryMode,
  NotificationPreferences,
  setNotificationPreferences,
} from "../services/NotificationPoller";
import { getErrorMessage } from "../utils/error";

const categoryOptions: {
  description: string;
  label: string;
  value: NotificationCategory;
}[] = [
  {
    description: "Replies, mentions, and direct chat mentions",
    label: "Mentions and replies",
    value: "mentions",
  },
  {
    description: "Favourites, reposts, and emoji reactions",
    label: "Reactions",
    value: "reactions",
  },
  {
    description: "New followers and follow requests",
    label: "Follows",
    value: "follows",
  },
  {
    description: "Group follows, requests, and group-post activity",
    label: "Groups",
    value: "groups",
  },
  {
    description: "Event reminders and participation changes",
    label: "Events",
    value: "events",
  },
  { description: "Poll results", label: "Polls", value: "polls" },
  {
    description: "New posts and edits from followed accounts",
    label: "Post updates",
    value: "updates",
  },
  {
    description: "Server-specific activity not listed above",
    label: "Other activity",
    value: "other",
  },
];

function initialPreferences(): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories },
  };
}

export default function NotificationPreferencesScreen() {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    try {
      setPreferences(await getNotificationPreferences(ctx));
    } catch (reason) {
      Alert.alert(
        "Could not load notification preferences",
        getErrorMessage(reason),
      );
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!ctx?.login) return <SuggestLogin />;

  function setCategory(category: NotificationCategory, value: boolean) {
    setPreferences(current => ({
      ...current,
      categories: { ...current.categories, [category]: value },
    }));
  }

  function setDeliveryMode(deliveryMode: NotificationDeliveryMode) {
    setPreferences(current => ({ ...current, deliveryMode }));
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const normalized = await setNotificationPreferences(ctx!, preferences);
      setPreferences(normalized);
      Alert.alert(
        "Preferences saved",
        "Future local alerts will use these settings.",
      );
    } catch (reason) {
      Alert.alert(
        "Could not save notification preferences",
        getErrorMessage(reason),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text secondary>
        These controls apply to this account on this phone. The Notifications
        tab still keeps the full server history.
      </Text>

      <Text style={styles.sectionTitle}>Alert categories</Text>
      {categoryOptions.map(option => (
        <View key={option.value} style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.label}>{option.label}</Text>
            <Text secondary>{option.description}</Text>
          </View>
          <Switch
            accessibilityLabel={`Local alerts for ${option.label}`}
            disabled={loading}
            onValueChange={value => setCategory(option.value, value)}
            value={preferences.categories[option.value]}
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>Delivery</Text>
      <View style={styles.choices}>
        {(
          [
            ["individual", "Individual alerts"],
            ["digest", "One digest per check"],
          ] as [NotificationDeliveryMode, string][]
        ).map(([value, label]) => (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: preferences.deliveryMode === value }}
            key={value}
            onPress={() => setDeliveryMode(value)}
            style={[
              styles.choice,
              {
                borderColor:
                  preferences.deliveryMode === value
                    ? theme.tint
                    : theme.tertiaryBackground,
              },
              preferences.deliveryMode === value && {
                backgroundColor: theme.secondaryBackground,
              },
            ]}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
      </View>
      <PreferenceSwitch
        label="Play notification sound"
        onChange={sound => setPreferences(current => ({ ...current, sound }))}
        value={preferences.sound}
      />
      <PreferenceSwitch
        label="Show post text in alerts"
        onChange={showPostPreview =>
          setPreferences(current => ({ ...current, showPostPreview }))
        }
        value={preferences.showPostPreview}
      />

      <Text style={styles.sectionTitle}>Quiet hours</Text>
      <PreferenceSwitch
        label="Defer alerts during quiet hours"
        onChange={quietHoursEnabled =>
          setPreferences(current => ({ ...current, quietHoursEnabled }))
        }
        value={preferences.quietHoursEnabled}
      />
      {preferences.quietHoursEnabled ? (
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <Text secondary>Start</Text>
            <TextInput
              accessibilityLabel="Quiet hours start time"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={quietHoursStart =>
                setPreferences(current => ({ ...current, quietHoursStart }))
              }
              placeholder="22:00"
              style={styles.timeInput}
              value={preferences.quietHoursStart}
            />
          </View>
          <View style={styles.timeField}>
            <Text secondary>End</Text>
            <TextInput
              accessibilityLabel="Quiet hours end time"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={quietHoursEnd =>
                setPreferences(current => ({ ...current, quietHoursEnd }))
              }
              placeholder="07:00"
              style={styles.timeInput}
              value={preferences.quietHoursEnd}
            />
          </View>
        </View>
      ) : null}
      <Text secondary>
        Use 24-hour local time. Deferred alerts remain eligible for the first
        background check after quiet hours.
      </Text>

      <AppButton
        disabled={loading || saving}
        fullWidth
        onPress={() => void save()}
        title={saving ? "Saving..." : "Save notification preferences"}
      />
    </ScrollView>
  );
}

function PreferenceSwitch({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
  },
  switchLabel: { flex: 1 },
  label: { fontWeight: "600" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  timeRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1, gap: 5 },
  timeInput: { fontSize: 17, minHeight: 48 },
});

/* end of NotificationPreferencesScreen.tsx */
