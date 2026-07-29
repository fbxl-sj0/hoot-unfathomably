/*
    Project: Hoot Mobile
    -------------------

    File: EditCommunityScreen.tsx

    Purpose:

        Edit the current community description.

    Responsibilities:

        - Choose editable markdown/text from server content
        - Submit trimmed description updates
        - Prevent duplicate in-flight updates
        - Return to refreshed community details

    This file intentionally does NOT contain:

        - community creation
        - moderation actions
*/

import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import AppButton from "../components/AppButton";
import { TextInput } from "../components/Themed";
import SuggestLogin from "../components/SuggestLogin";
import useTheme from "../hooks/useTheme";
import { RootStackScreenProps } from "../types";
import * as LotideService from "../services/LotideService";
import ActorDisplayComponent from "../components/ActorDisplay";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { getErrorMessage } from "../utils/error";

export default function EditCommunityScreen({
  navigation,
  route,
}: RootStackScreenProps<"EditCommunity">) {
  const community = route.params.community;
  const [description, setDescription] = useState(
    getEditableCommunityDescription(community.description),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const theme = useTheme();
  const ctx = useLotideCtx();

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      isSubmittingRef.current = false;
    };
  }, []);

  if (!ctx?.login) {
    return <SuggestLogin />;
  }

  const activeCtx = ctx;

  function alertIfMounted(title: string, message: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  async function submit() {
    if (isSubmittingRef.current) return;
    if (isSubmitting) return;

    const trimmedDescription = description.trim();

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      await LotideService.editCommunity(
        activeCtx,
        community.id,
        trimmedDescription,
      );

      if (!isMountedRef.current) return;

      const data = await LotideService.getCommunity(activeCtx, community.id);

      if (!isMountedRef.current) return;

      navigation.navigate("Community", {
        community: data,
      });
    } catch (e) {
      alertIfMounted("Failed to edit community", getErrorMessage(e));
    } finally {
      isSubmittingRef.current = false;

      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Pressable
        style={styles.root}
        onPress={() => Platform.OS !== "web" && Keyboard.dismiss()}
      >
        <ActorDisplayComponent
          name={community.name}
          host={community.host}
          local={community.local}
          showHost="always"
          newLine
          style={styles.title}
        />
        <TextInput
          accessibilityLabel="Community description"
          style={styles.input}
          multiline
          placeholder="Add a description"
          value={description}
          onChangeText={setDescription}
        />
        <AppButton
          title={isSubmitting ? "Saving..." : "Save Description"}
          accessibilityLabel="Save community description"
          color={theme.tint}
          disabled={isSubmitting}
          onPress={() => {
            void submit();
          }}
          fullWidth
        />
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function getEditableCommunityDescription(description: Community["description"]) {
  if (typeof description === "string") {
    return description;
  }

  if (!description) {
    return "";
  }

  return (
    description.content_markdown ||
    description.content_text ||
    description.content_html ||
    ""
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingBottom: 100 },
  title: {
    fontSize: 20,
    marginVertical: 10,
  },
  input: {
    marginVertical: 20,
    minHeight: 100,
  },
});

/* end of EditCommunityScreen.tsx */
