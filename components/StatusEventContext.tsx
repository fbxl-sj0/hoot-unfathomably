/*
    Project: Hoot Unfathomably
    --------------------------

    File: StatusEventContext.tsx

    Purpose:

        Present and update participation for an event status.

    Responsibilities:

        - Show server-owned time, place, participation mode, and attendance
        - Join, request to join, or leave only after an explicit user action
        - Preserve the returned event state instead of guessing locally

    This file intentionally does NOT contain:

        - event creation or organizer moderation
        - calendar integration
        - remote event-provider requests
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";

import useTheme from "../hooks/useTheme";
import {
  setEventJoined,
  UnfathomablyEvent,
  UnfathomablyStatus,
} from "../services/UnfathomablyService";
import { getErrorMessage } from "../utils/error";
import { Text, View } from "./Themed";

function readableDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toLocaleString();
}

function eventPlace(event: UnfathomablyEvent): string | undefined {
  const location = event.location;
  if (!location) return undefined;
  return [
    location.name,
    location.street,
    location.locality,
    location.region,
    location.country,
  ].filter((value): value is string => typeof value === "string" && !!value.trim())
    .join(", ") || undefined;
}

function participationLabel(event: UnfathomablyEvent, saving: boolean): string {
  if (saving) return "Saving...";
  if (event.join_state === "accept") return "Leave event";
  if (event.join_state === "pending") return "Requested";
  if (event.join_mode === "restricted") return "Request to join";
  return "Join event";
}

export default function StatusEventContext({
  ctx,
  status,
}: {
  ctx: LotideContext;
  status: UnfathomablyStatus;
}) {
  const theme = useTheme();
  const [event, setEvent] = useState(status.pleroma?.event);
  const [saving, setSaving] = useState(false);

  if (!event) return null;

  const start = readableDate(event.start_time);
  const end = readableDate(event.end_time);
  const place = eventPlace(event);
  const joined = event.join_state === "accept";
  const disabled = saving || event.join_state === "pending" || event.join_mode === "invite";

  async function toggleParticipation() {
    if (!event || disabled) return;
    setSaving(true);
    try {
      const updated = await setEventJoined(ctx, status.id, !joined);
      if (updated.pleroma?.event) setEvent(updated.pleroma.event);
    } catch (error) {
      Alert.alert("Could not update event participation", getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.secondaryBackground,
          borderColor: theme.tertiaryBackground,
        },
      ]}
    >
      <View style={[styles.titleRow, { backgroundColor: theme.secondaryBackground }]}>
        <Icon name="calendar-outline" color={theme.tint} size={21} />
        <Text style={styles.title}>{event.name || "Event"}</Text>
      </View>
      {start ? <Text><Text secondary>Starts: </Text>{start}</Text> : null}
      {end ? <Text><Text secondary>Ends: </Text>{end}</Text> : null}
      {place ? <Text><Text secondary>Place: </Text>{place}</Text> : null}
      <Text secondary>
        {event.participants_count || 0} participant{event.participants_count === 1 ? "" : "s"}
        {event.join_mode === "restricted" ? " · Approval required" : event.join_mode === "invite" ? " · Invitation only" : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={participationLabel(event, saving)}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={pressEvent => {
          pressEvent.stopPropagation();
          void toggleParticipation();
        }}
        style={[
          styles.action,
          { backgroundColor: joined ? theme.tertiaryBackground : theme.tint },
          disabled && styles.disabled,
        ]}
      >
        <Icon
          name={joined ? "exit-outline" : "enter-outline"}
          color={joined ? theme.text : theme.onTint}
          size={20}
        />
        <Text style={{ color: joined ? theme.text : theme.onTint }}>
          {participationLabel(event, saving)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 10, borderWidth: 1, gap: 7, marginTop: 12, padding: 12 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: "700" },
  action: { alignItems: "center", alignSelf: "flex-start", borderRadius: 9, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  disabled: { opacity: 0.5 },
});

/* end of StatusEventContext.tsx */
