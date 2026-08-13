/*
    Project: Hoot Unfathomably
    --------------------------

    File: StatusActionsScreen.tsx

    Purpose:

        Present less-frequent actions for one Fediverse post.

    Responsibilities:

        - Translate a post through the signed-in server
        - Route post and account reports to the explicit report form
        - Open editing for a post owned by the active account
        - Start a deliberate cross-account reaction

    This file intentionally does NOT contain:

        - moderation request construction
        - cross-account status resolution
        - post mutation request details
*/

import Icon from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { stripHtml } from "../components/StatusCard";
import { Text, TextInput, View } from "../components/Themed";
import { SCROLL_FORM_BOTTOM_PADDING } from "../constants/TouchTargets";
import useI18n from "../hooks/useI18n";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Safety from "../services/UnfathomablySafetyService";
import * as Unfathomably from "../services/UnfathomablyService";
import type { RootStackScreenProps } from "../types";
import { createComposeIntent } from "../utils/composeIntent";
import { getErrorMessage } from "../utils/error";

export default function StatusActionsScreen({
  navigation,
  route,
}: RootStackScreenProps<"StatusActions">) {
  const ctx = useLotideCtx();
  const { t } = useI18n();
  const [status, setStatus] = useState<Unfathomably.UnfathomablyStatus>();
  const [error, setError] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [translation, setTranslation] = useState<Safety.StatusTranslation>();
  const [translating, setTranslating] = useState(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setError("");
    try {
      setStatus(await Unfathomably.getStatus(ctx, route.params.statusId));
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }, [ctx, route.params.statusId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!ctx?.login) return <SuggestLogin />;
  if (!status) {
    return error ? (
      <RetryState message={error} onRetry={() => void load()} />
    ) : (
      <Text style={styles.loading}>Loading post actions...</Text>
    );
  }

  const ownAccountId = String(ctx.login.user?.id ?? "");
  const canEdit =
    ownAccountId !== "" && ownAccountId === String(status.account.id);

  async function translate() {
    if (translating) return;
    setTranslating(true);
    try {
      setTranslation(
        await Safety.translateStatus(
          ctx!,
          status!.id,
          targetLanguage || undefined,
        ),
      );
    } catch (reason) {
      Alert.alert("Could not translate post", getErrorMessage(reason));
    } finally {
      setTranslating(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heading}>
        <Icon name="person-circle-outline" size={34} />
        <View style={styles.headingText}>
          <Text style={styles.author}>
            {status.account.display_name || status.account.username}
          </Text>
          <Text secondary>@{status.account.acct}</Text>
        </View>
      </View>
      <Text numberOfLines={6}>{stripHtml(status.content) || "Media post"}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("actions.translate")}</Text>
        <Text secondary>{t("actions.translateHelp")}</Text>
        <TextInput
          accessibilityLabel={t("actions.targetLanguage")}
          autoCapitalize="none"
          maxLength={16}
          onChangeText={setTargetLanguage}
          placeholder={t("actions.languagePlaceholder")}
          style={styles.input}
          value={targetLanguage}
        />
        <AppButton
          disabled={translating}
          fullWidth
          onPress={() => void translate()}
          title={
            translating ? t("actions.translating") : t("actions.translatePost")
          }
        />
        {translation ? (
          <View accessibilityRole="summary" style={styles.translation}>
            <Text style={styles.translationTitle}>
              Translation
              {translation.detectedSourceLanguage
                ? ` from ${translation.detectedSourceLanguage}`
                : ""}
            </Text>
            <Text selectable>{stripHtml(translation.content)}</Text>
            {translation.provider ? (
              <Text secondary>Provided by {translation.provider}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("actions.postActions")}</Text>
        {canEdit ? (
          <AppButton
            fullWidth
            onPress={() =>
              navigation.navigate("Root", {
                screen: "NewPostScreen",
                params: createComposeIntent({ editStatusId: status.id }),
              })
            }
            title={t("actions.edit")}
          />
        ) : null}
        <AppButton
          fullWidth
          onPress={() =>
            navigation.navigate("CrossAccountAction", { statusId: status.id })
          }
          title={t("actions.otherAccount")}
        />
        {status.url ? (
          <>
            <AppButton
              fullWidth
              onPress={() =>
                void Share.share({
                  message:
                    `${stripHtml(status.content)}\n\n${status.url}`.trim(),
                  title: `Post by ${status.account.display_name || status.account.acct}`,
                  url: status.url,
                }).catch(reason => {
                  Alert.alert("Could not share post", getErrorMessage(reason));
                })
              }
              title={t("actions.share")}
            />
            <AppButton
              fullWidth
              onPress={() =>
                void Linking.openURL(status.url!).catch(reason => {
                  Alert.alert("Could not open post", getErrorMessage(reason));
                })
              }
              title={t("actions.openBrowser")}
            />
          </>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("actions.safety")}</Text>
        <AppButton
          fullWidth
          onPress={() =>
            navigation.navigate("Report", {
              accountId: status.account.id,
              accountLabel: status.account.acct,
              statusId: status.id,
            })
          }
          title={t("actions.reportPost")}
        />
        <AppButton
          fullWidth
          onPress={() =>
            navigation.navigate("Report", {
              accountId: status.account.id,
              accountLabel: status.account.acct,
            })
          }
          title={t("actions.reportAccount")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
    padding: 16,
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
  loading: { padding: 30, textAlign: "center" },
  heading: { alignItems: "center", flexDirection: "row", gap: 10 },
  headingText: { flex: 1 },
  author: { fontSize: 18, fontWeight: "700" },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  input: { minHeight: 48 },
  translation: { borderRadius: 10, gap: 8, padding: 14 },
  translationTitle: { fontWeight: "700" },
});

/* end of StatusActionsScreen.tsx */
