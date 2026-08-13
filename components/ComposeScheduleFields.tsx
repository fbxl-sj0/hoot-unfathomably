/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeScheduleFields.tsx

    Purpose:

        Let a composer choose an understandable future publication time.

    Responsibilities:

        - Offer useful one-tap schedule presets
        - Use the platform date and time picker for exact scheduling
        - Preserve one combined ISO timestamp for drafts and API requests
        - Expose clear accessibility roles and selected state

    This file intentionally does NOT contain:

        - scheduled-status network requests
        - draft persistence
        - timezone conversion outside the device locale
*/

import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";

import { Text, View } from "./Themed";
import useTheme from "../hooks/useTheme";

type SchedulePreset = "hour" | "tomorrow-morning" | "tomorrow-evening";

export function getSchedulePreset(
  preset: SchedulePreset,
  now = new Date(),
): Date {
  const result = new Date(now);

  if (preset === "hour") {
    result.setMinutes(result.getMinutes() + 60, 0, 0);
    return result;
  }

  result.setDate(result.getDate() + 1);
  result.setHours(preset === "tomorrow-morning" ? 9 : 18, 0, 0, 0);
  return result;
}

function dateFromValue(value: string | undefined, fallback: Date): Date {
  const parsed = value ? new Date(value) : fallback;
  return Number.isFinite(parsed.getTime())
    ? parsed
    : fallback;
}

export default function ComposeScheduleFields({
  onChange,
  value,
}: {
  onChange: (value: string | undefined) => void;
  value?: string;
}) {
  const theme = useTheme();
  const [defaultDate] = useState(() => getSchedulePreset("hour"));
  const [minimumDate] = useState(() => new Date(Date.now() + 5 * 60 * 1_000));
  const [pickerMode, setPickerMode] = useState<"date" | "datetime" | "time">();
  const scheduled = value !== undefined;
  const selectedDate = dateFromValue(value, defaultDate);

  function selectPreset(preset: SchedulePreset) {
    onChange(getSchedulePreset(preset).toISOString());
    setPickerMode(undefined);
  }

  function handlePickerChange(
    event: DateTimePickerEvent,
    date: Date | undefined,
  ) {
    if (event.type === "dismissed" || !date) {
      setPickerMode(undefined);
      return;
    }

    if (Platform.OS === "android" && pickerMode === "date") {
      const combined = new Date(selectedDate);
      combined.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      onChange(combined.toISOString());
      setPickerMode("time");
      return;
    }

    if (Platform.OS === "android" && pickerMode === "time") {
      const combined = new Date(selectedDate);
      combined.setHours(date.getHours(), date.getMinutes(), 0, 0);
      onChange(combined.toISOString());
      setPickerMode(undefined);
      return;
    }

    onChange(date.toISOString());
  }

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel="Schedule this post"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: scheduled }}
        onPress={() => onChange(
          scheduled ? undefined : getSchedulePreset("hour").toISOString(),
        )}
        style={[
          styles.toggle,
          scheduled && { backgroundColor: theme.tertiaryBackground },
        ]}
      >
        <Text>Schedule for later</Text>
      </Pressable>

      {scheduled ? (
        <View style={styles.fields}>
          <Text style={styles.selectedTime}>
            {selectedDate.toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
          <View style={styles.presets}>
            {([
              ["hour", "In one hour"],
              ["tomorrow-morning", "Tomorrow morning"],
              ["tomorrow-evening", "Tomorrow evening"],
            ] as const).map(([preset, label]) => (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                key={preset}
                onPress={() => selectPreset(preset)}
                style={styles.pill}
              >
                <Text>{label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityLabel="Choose an exact date and time"
              accessibilityRole="button"
              onPress={() => setPickerMode(
                Platform.OS === "android" ? "date" : "datetime",
              )}
              style={styles.pill}
            >
              <Text>Choose date and time</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {pickerMode ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={minimumDate}
          mode={pickerMode}
          onChange={handlePickerChange}
          value={selectedDate}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  toggle: {
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 13,
  },
  fields: {
    gap: 10,
  },
  selectedTime: {
    fontSize: 17,
    fontWeight: "700",
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderRadius: 19,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
});

/* end of ComposeScheduleFields.tsx */
