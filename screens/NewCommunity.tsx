/*
    Project: Hoot Mobile
    -------------------

    File: NewCommunity.tsx

    Purpose:

        Create a new Lotide community.

    Responsibilities:

        - Submit a trimmed community name
        - Optionally save an initial description
        - Load the created community
        - Navigate to the new community screen

    This file intentionally does NOT contain:

        - community editing
        - moderation
*/

import React, { useLayoutEffect, useRef, useState } from "react";
import { Alert, StyleSheet, TextInput } from "react-native";
import AppButton from "../components/AppButton";
import { Text, View } from "../components/Themed";
import SuggestLogin from "../components/SuggestLogin";
import useTheme from "../hooks/useTheme";
import { RootStackScreenProps } from "../types";
import * as LotideService from "../services/LotideService";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { getErrorMessage } from "../utils/error";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";

const MIN_COMMUNITY_NAME_LENGTH = 4;

export default function NewCommunityScreen({
  navigation,
}: RootStackScreenProps<"NewCommunity">) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const theme = useTheme();
  const ctx = useLotideCtx();
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const remainingNameCharacters =
    trimmedName.length > 0
      ? Math.max(MIN_COMMUNITY_NAME_LENGTH - trimmedName.length, 0)
      : MIN_COMMUNITY_NAME_LENGTH;
  const canSubmit =
    !!ctx?.login &&
    trimmedName.length >= MIN_COMMUNITY_NAME_LENGTH &&
    !isSubmitting;

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

  async function runOptionalCommunitySetup(id: CommunityId): Promise<string[]> {
    const warnings: string[] = [];

    if (trimmedDescription) {
      try {
        await LotideService.editCommunity(activeCtx, id, trimmedDescription);
      } catch (error) {
        warnings.push(`Description was not saved: ${getErrorMessage(error)}`);
      }
    }

    try {
      await LotideService.followCommunity(activeCtx, id);
    } catch (error) {
      warnings.push(`Follow did not complete: ${getErrorMessage(error)}`);
    }

    return warnings;
  }

  async function submit() {
    if (isSubmittingRef.current) return;
    if (!canSubmit) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const data = await LotideService.newCommunity(activeCtx, trimmedName);
      const id = data.community.id;

      if (!isMountedRef.current) return;

      const warnings = await runOptionalCommunitySetup(id);

      if (!isMountedRef.current) return;

      try {
        const community = await LotideService.getCommunity(activeCtx, id);

        if (!isMountedRef.current) return;

        navigation.replace("Community", { community });
      } catch (error) {
        if (!isMountedRef.current) return;

        navigation.replace("Community", { id });
        warnings.push(
          `Community was created, but could not be reloaded: ${getErrorMessage(error)}`,
        );
      }

      if (warnings.length > 0) {
        alertIfMounted("Community created", warnings.join("\n"));
      }
    } catch (e) {
      alertIfMounted("Failed to create community", getErrorMessage(e));
    } finally {
      isSubmittingRef.current = false;

      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <View style={styles.root}>
      <TextInput
        accessibilityLabel="Community name"
        style={[styles.input, { fontSize: 20, color: theme.text }]}
        placeholder="Community Name"
        placeholderTextColor={theme.placeholderText}
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {trimmedName.length >= MIN_COMMUNITY_NAME_LENGTH ? (
        <>
          <TextInput
            accessibilityLabel="Community description"
            style={[styles.input, { color: theme.text }]}
            placeholder="Description (Optional)"
            placeholderTextColor={theme.placeholderText}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <AppButton
            title={isSubmitting ? "Creating..." : "Create Community"}
            color={theme.tint}
            onPress={() => {
              void submit();
            }}
            accessibilityLabel="Create new community"
            disabled={!canSubmit}
            fullWidth
          />
        </>
      ) : (
        <Text secondary>
          {trimmedName.length > 0
            ? `${remainingNameCharacters} more character${
                remainingNameCharacters === 1 ? "" : "s"
              }`
            : "Community names need at least 4 characters."}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "flex-start",
    padding: 15,
    height: "100%",
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
  inputContainer: {
    width: "100%",
    padding: 20,
  },
  input: {
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingVertical: 10,
    width: "100%",
    borderRadius: 8,
  },
  item: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 1,
  },
});

/* end of NewCommunity.tsx */
