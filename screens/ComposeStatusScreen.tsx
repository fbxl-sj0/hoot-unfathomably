/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeStatusScreen.tsx

    Purpose:

        Compose, save, schedule, publish, or edit portable Fediverse posts.

    Responsibilities:

        - Isolate group, reply, quote, edit, and ordinary compose intents
        - Autosave complete account-scoped drafts and restore them safely
        - Publish ordinary posts from one or more explicitly selected accounts
        - Schedule posts and edit existing source through standard APIs
        - Collect visibility, language, warnings, media descriptions, and polls

    This file intentionally does NOT contain:

        - media upload request construction
        - scheduled-post list management
        - cross-account reply or group target resolution
*/

import React, { useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import AppButton from "../components/AppButton";
import ComposeAccountPicker from "../components/ComposeAccountPicker";
import ComposePollFields, {
  pollDraftIsValid,
} from "../components/ComposePollFields";
import ComposeScheduleFields from "../components/ComposeScheduleFields";
import SuggestLogin from "../components/SuggestLogin";
import { stripHtml } from "../components/StatusCard";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import useI18n from "../hooks/useI18n";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  composeDrafts,
  ComposeDraft,
  createComposeDraft,
  isMeaningfulComposeDraft,
} from "../services/ComposeDraftService";
import {
  persistComposeDraftMedia,
  removeAllComposeDraftMedia,
  removeComposeDraftMedia,
} from "../services/ComposeDraftMediaService";
import {
  getSavedAuthenticatedAccounts,
  SavedAuthenticatedAccount,
} from "../services/SavedAccountService";
import { accountStoreKeyForContext } from "../services/StorageService";
import * as Unfathomably from "../services/UnfathomablyService";
import { getErrorMessage } from "../utils/error";

export type ComposeRouteParams = {
  composeIntentId?: string;
  draftId?: string;
  editStatusId?: string;
  groupId?: string;
  groupName?: string;
  inReplyToId?: string;
  quoteId?: string;
  quoteParameter?: Unfathomably.QuoteParameter;
};

function fallbackDraftId(): string {
  return `compose-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function draftFromParams(
  ctx: LotideContext,
  id: string,
  params: ComposeRouteParams,
): ComposeDraft {
  const accountKey = accountStoreKeyForContext(ctx);
  return createComposeDraft(id, {
    groupId: params.groupId,
    groupName: params.groupName,
    inReplyToId: params.inReplyToId,
    quoteId: params.quoteId,
    quoteParameter: params.quoteParameter,
    targetAccountKeys: accountKey ? [accountKey] : [],
  });
}

function isScheduledStatus(
  value:
    Unfathomably.UnfathomablyScheduledStatus | Unfathomably.UnfathomablyStatus,
): value is Unfathomably.UnfathomablyScheduledStatus {
  return "scheduled_at" in value && "params" in value;
}

export default function ComposeStatusScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: ComposeRouteParams };
}) {
  const ctx = useLotideCtx();
  const [generatedDraftId] = useState(fallbackDraftId);
  if (!ctx?.login) return <SuggestLogin />;

  const params = route.params || {};
  const draftId = params.draftId || params.composeIntentId || generatedDraftId;
  const intentKey = [
    ctx.apiUrl,
    draftId,
    params.editStatusId || "",
    params.groupId || "",
    params.inReplyToId || "",
    params.quoteId || "",
    params.quoteParameter || "",
  ].join(":");

  return (
    <ComposeStatusForm
      key={intentKey}
      ctx={ctx}
      draftId={draftId}
      navigation={navigation}
      params={params}
    />
  );
}

function ComposeStatusForm({
  ctx,
  draftId,
  navigation,
  params,
}: {
  ctx: LotideContext;
  draftId: string;
  navigation: any;
  params: ComposeRouteParams;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [draft, setDraft] = useState(() =>
    draftFromParams(ctx, draftId, params),
  );
  const [groups, setGroups] = useState<Unfathomably.UnfathomablyGroup[]>([]);
  const [savedAccounts, setSavedAccounts] = useState<
    SavedAuthenticatedAccount[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<number>();
  const [draftError, setDraftError] = useState("");
  const [targetStatus, setTargetStatus] =
    useState<Unfathomably.UnfathomablyStatus>();
  const draftRef = useRef(draft);
  const completedRef = useRef(false);
  const hydratedRef = useRef(false);
  const editStatusId = params.editStatusId;
  const replyId = draft.inReplyToId;
  const quoteId = draft.quoteId;
  const targetId = replyId || quoteId;
  const isPortableNewPost =
    !editStatusId && !replyId && !quoteId && !draft.groupId;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    let active = true;

    void getSavedAuthenticatedAccounts(ctx)
      .then(accounts => {
        if (!active) return;
        setSavedAccounts(accounts);
        const available = new Set(accounts.map(account => account.key));
        const activeKey = accountStoreKeyForContext(ctx);
        setDraft(current => {
          const retained = current.targetAccountKeys.filter(key =>
            available.has(key),
          );
          return {
            ...current,
            targetAccountKeys:
              retained.length > 0 ? retained : activeKey ? [activeKey] : [],
          };
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [ctx]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        if (editStatusId) {
          const [source, status] = await Promise.all([
            Unfathomably.getStatusSource(ctx, editStatusId),
            Unfathomably.getStatus(ctx, editStatusId),
          ]);
          if (!active) return;
          setTargetStatus(status);
          setDraft(current =>
            createComposeDraft(
              draftId,
              {
                ...current,
                content: source.text,
                contentWarning: source.spoiler_text,
                contentWarningEnabled: source.spoiler_text.trim().length > 0,
                media: status.media_attachments.map(media => ({
                  description: media.description || "",
                  id: media.id,
                  mimeType: media.type === "video" ? "video/mp4" : "image/jpeg",
                  uri: media.preview_url || media.url,
                })),
                sensitive: status.sensitive,
                visibility: status.visibility || "public",
              },
              current.createdAt,
            ),
          );
        } else {
          const saved = await composeDrafts.query(ctx, draftId);
          if (!active || !saved) return;
          setDraft(
            params.draftId
              ? saved
              : {
                  ...saved,
                  groupId: params.groupId,
                  groupName: params.groupName,
                  inReplyToId: params.inReplyToId,
                  quoteId: params.quoteId,
                  quoteParameter: params.quoteParameter,
                  visibility: params.groupId ? "unlisted" : saved.visibility,
                },
          );
        }
      } catch (reason) {
        if (active && editStatusId) {
          setDraftError(getErrorMessage(reason));
        }
      } finally {
        if (active) setHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    ctx,
    draftId,
    editStatusId,
    params.draftId,
    params.groupId,
    params.groupName,
    params.inReplyToId,
    params.quoteId,
    params.quoteParameter,
  ]);

  useEffect(() => {
    let active = true;
    void Unfathomably.getGroups(ctx)
      .then(next => {
        if (active) setGroups(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ctx]);

  useEffect(() => {
    let active = true;
    if (targetId) {
      void Unfathomably.getStatus(ctx, targetId)
        .then(next => {
          if (active) setTargetStatus(next);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [ctx, targetId]);

  useEffect(() => {
    if (!hydrated || completedRef.current) return;
    const timer = setTimeout(() => {
      const current = draftRef.current;
      const operation = isMeaningfulComposeDraft(current)
        ? composeDrafts.store(ctx, current)
        : composeDrafts.remove(ctx, current.id);
      void operation
        .then(() => {
          setSavedAt(Date.now());
          setDraftError("");
        })
        .catch(reason => setDraftError(getErrorMessage(reason)));
    }, 700);
    return () => clearTimeout(timer);
  }, [ctx, draft, hydrated]);

  useEffect(() => {
    return () => {
      if (
        completedRef.current ||
        !hydratedRef.current ||
        !isMeaningfulComposeDraft(draftRef.current)
      )
        return;
      void composeDrafts.store(ctx, draftRef.current).catch(() => undefined);
    };
  }, [ctx]);

  function updateDraft(change: Partial<ComposeDraft>) {
    setSavedAt(undefined);
    setDraft(current => ({ ...current, ...change }));
  }

  async function chooseMedia() {
    if (draft.media.length >= 4) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access is off",
        "Allow photo access in Android settings to attach images or video.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images", "videos"],
      quality: 0.9,
      selectionLimit: 4 - draft.media.length,
    });
    if (result.canceled) return;
    let selected;
    try {
      selected = await Promise.all(
        result.assets.slice(0, 4 - draft.media.length).map(asset =>
          persistComposeDraftMedia(ctx, {
            description: "",
            mimeType:
              asset.mimeType ||
              (asset.type === "video" ? "video/mp4" : "image/jpeg"),
            name:
              asset.fileName ||
              `attachment-${Date.now()}.${asset.type === "video" ? "mp4" : "jpg"}`,
            uri: asset.uri,
          }),
        ),
      );
    } catch (reason) {
      Alert.alert("Could not save attachment", getErrorMessage(reason));
      return;
    }
    updateDraft({
      media: [...draft.media, ...selected],
      pollEnabled: false,
    });
  }

  async function mediaIdsForAccount(account: SavedAuthenticatedAccount) {
    return Promise.all(
      draft.media.map(async media => {
        if (media.id && account.isActive) {
          await Unfathomably.updateMediaDescription(
            account.context,
            media.id,
            media.description,
          );
          return media.id;
        }
        if (!media.uri) {
          throw new Error("An attachment is unavailable for this account.");
        }
        const uploaded = await Unfathomably.uploadMedia(account.context, {
          description: media.description,
          mimeType: media.mimeType,
          name: media.name,
          uri: media.uri,
        });
        return uploaded.id;
      }),
    );
  }

  async function saveDraft() {
    if (!isMeaningfulComposeDraft(draftRef.current)) return;
    try {
      const saved = await composeDrafts.store(ctx, draftRef.current);
      setDraft(saved);
      setSavedAt(saved.updatedAt);
      setDraftError("");
      Alert.alert("Draft saved", "You can return to it from More → Drafts.");
    } catch (reason) {
      setDraftError(getErrorMessage(reason));
    }
  }

  function clearComposeIntent() {
    completedRef.current = true;
    removeAllComposeDraftMedia(draftRef.current.media);
    void composeDrafts.remove(ctx, draftId).catch(() => undefined);
    navigation.setParams?.({
      composeIntentId: undefined,
      draftId: undefined,
      editStatusId: undefined,
      groupId: undefined,
      groupName: undefined,
      inReplyToId: undefined,
      quoteId: undefined,
      quoteParameter: undefined,
    });
  }

  async function submit() {
    if ((!draft.content.trim() && draft.media.length === 0) || submitting)
      return;
    setSubmitting(true);

    try {
      if (editStatusId) {
        const activeAccount = savedAccounts.find(
          account => account.isActive,
        ) || {
          account: ctx.login!
            .user as unknown as Unfathomably.UnfathomablyAccount,
          context: ctx,
          isActive: true,
          key: accountStoreKeyForContext(ctx) || "active",
        };
        const mediaIds = await mediaIdsForAccount(activeAccount);
        const updated = await Unfathomably.updateStatus(
          ctx,
          editStatusId,
          draft.content.trim(),
          {
            contentWarning: draft.contentWarningEnabled
              ? draft.contentWarning
              : undefined,
            language: draft.language,
            mediaIds,
            poll: draft.pollEnabled ? draft.poll : undefined,
            sensitive: draft.sensitive,
          },
        );
        clearComposeIntent();
        navigation.replace?.("Status", { statusId: updated.id });
        if (!navigation.replace) {
          navigation.navigate("Status", { statusId: updated.id });
        }
        return;
      }

      let quoteParameter = draft.quoteParameter;
      if (!quoteId) quoteParameter = undefined;
      else if (targetStatus) {
        quoteParameter = Unfathomably.getQuoteParameter(targetStatus);
      }

      const activeKey = accountStoreKeyForContext(ctx);
      const destinations = isPortableNewPost
        ? savedAccounts.filter(account =>
            draft.targetAccountKeys.includes(account.key),
          )
        : [];
      const activeAccount = savedAccounts.find(account => account.isActive);
      const accounts =
        destinations.length > 0
          ? destinations
          : activeAccount
            ? [activeAccount]
            : [
                {
                  account: ctx.login!
                    .user as unknown as Unfathomably.UnfathomablyAccount,
                  context: ctx,
                  isActive: true,
                  key: activeKey || "active",
                },
              ];
      const results = await Promise.allSettled(
        accounts.map(async account => {
          const mediaIds = await mediaIdsForAccount(account);
          return Unfathomably.createStatus(
            account.context,
            draft.content.trim(),
            {
              contentWarning: draft.contentWarningEnabled
                ? draft.contentWarning
                : undefined,
              groupId: draft.groupId,
              idempotencyKey: `${draft.id}:${account.key}`,
              inReplyToId: replyId,
              language: draft.language,
              mediaIds,
              poll: draft.pollEnabled ? draft.poll : undefined,
              quoteId,
              quoteParameter,
              scheduledAt: draft.scheduledAt,
              sensitive: draft.sensitive,
              visibility: draft.visibility,
            },
          );
        }),
      );
      const failures = results
        .map((result, index) => ({ account: accounts[index], result }))
        .filter(
          (
            entry,
          ): entry is {
            account: SavedAuthenticatedAccount;
            result: PromiseRejectedResult;
          } => entry.result.status === "rejected",
        );

      if (failures.length > 0) {
        updateDraft({
          targetAccountKeys: failures.map(entry => entry.account.key),
        });
        const successes = results.length - failures.length;
        Alert.alert(
          successes > 0 ? "Some posts were published" : "Could not publish",
          failures
            .map(
              entry =>
                `${entry.account.account.acct}: ${getErrorMessage(entry.result.reason)}`,
            )
            .join("\n"),
        );
        return;
      }

      const fulfilled = results as PromiseFulfilledResult<
        | Unfathomably.UnfathomablyScheduledStatus
        | Unfathomably.UnfathomablyStatus
      >[];
      const activeResult =
        fulfilled[
          Math.max(
            0,
            accounts.findIndex(account => account.isActive),
          )
        ]?.value;
      clearComposeIntent();

      if (
        draft.scheduledAt ||
        (activeResult && isScheduledStatus(activeResult))
      ) {
        navigation.navigate("ScheduledPosts");
      } else if (activeResult) {
        navigation.navigate("Status", { statusId: activeResult.id });
      } else {
        navigation.navigate("FeedScreen");
      }
    } catch (reason) {
      Alert.alert(
        editStatusId ? "Could not save changes" : "Could not publish",
        getErrorMessage(reason),
      );
    } finally {
      setSubmitting(false);
    }
  }

  let scheduleValid = true;
  if (draft.scheduledAt) {
    try {
      Unfathomably.normalizeScheduledAt(draft.scheduledAt);
    } catch {
      scheduleValid = false;
    }
  }
  const formValid =
    hydrated &&
    !submitting &&
    (draft.content.trim().length > 0 || draft.media.length > 0) &&
    (!draft.contentWarningEnabled || draft.contentWarning.trim().length > 0) &&
    (!draft.pollEnabled ||
      (draft.media.length === 0 && pollDraftIsValid(draft.poll))) &&
    scheduleValid;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>
            {editStatusId
              ? t("compose.edit")
              : replyId
                ? t("compose.reply")
                : quoteId
                  ? t("compose.quote")
                  : draft.groupId
                    ? t("compose.group")
                    : t("compose.new")}
          </Text>
          <Pressable
            accessibilityLabel={t("compose.openDrafts")}
            accessibilityRole="button"
            onPress={() => navigation.navigate("Drafts")}
            style={styles.headerAction}
          >
            <Text tint>{t("compose.drafts")}</Text>
          </Pressable>
        </View>

        {draftError ? (
          <Text accessibilityLiveRegion="polite" style={{ color: theme.red }}>
            {draftError}
          </Text>
        ) : null}
        {savedAt ? <Text secondary>{t("compose.savedOnDevice")}</Text> : null}

        {targetId ? (
          <View
            style={[
              styles.replyTarget,
              { backgroundColor: theme.secondaryBackground },
            ]}
          >
            <Text secondary style={styles.targetLabel}>
              {replyId ? t("compose.replyingTo") : t("compose.quoting")}
            </Text>
            {targetStatus ? (
              <>
                <Text style={styles.targetAuthor}>
                  {targetStatus.account.display_name ||
                    targetStatus.account.acct}
                </Text>
                <Text numberOfLines={4}>
                  {stripHtml((targetStatus.reblog || targetStatus).content)}
                </Text>
              </>
            ) : (
              <Text secondary>{t("compose.loadingPost")}</Text>
            )}
          </View>
        ) : null}

        {isPortableNewPost ? (
          <ComposeAccountPicker
            accounts={savedAccounts}
            onChange={targetAccountKeys => updateDraft({ targetAccountKeys })}
            selectedKeys={draft.targetAccountKeys}
          />
        ) : null}

        {!replyId && !editStatusId ? (
          <View>
            <Text secondary style={styles.label}>
              {t("compose.postTo")}
            </Text>
            <ScrollView
              contentContainerStyle={styles.groupPicker}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Pressable
                accessibilityLabel={t("compose.postToFeed")}
                accessibilityRole="radio"
                accessibilityState={{ checked: !draft.groupId }}
                onPress={() =>
                  updateDraft({
                    groupId: undefined,
                    groupName: undefined,
                    visibility: "public",
                  })
                }
                style={[
                  styles.pill,
                  !draft.groupId && { backgroundColor: theme.tint },
                ]}
              >
                <Text
                  style={!draft.groupId ? { color: theme.onTint } : undefined}
                >
                  {t("compose.myFeed")}
                </Text>
              </Pressable>
              {groups
                .filter(group => group.relationship?.can_post !== false)
                .map(group => (
                  <Pressable
                    accessibilityLabel={`Post to ${group.display_name}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: draft.groupId === group.id }}
                    key={group.id}
                    onPress={() =>
                      updateDraft({
                        groupId: group.id,
                        groupName: group.display_name,
                        targetAccountKeys: activeKey(ctx),
                        visibility: "unlisted",
                      })
                    }
                    style={[
                      styles.pill,
                      draft.groupId === group.id && {
                        backgroundColor: theme.tint,
                      },
                    ]}
                  >
                    <Text
                      style={
                        draft.groupId === group.id
                          ? { color: theme.onTint }
                          : undefined
                      }
                    >
                      {group.display_name}
                    </Text>
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        ) : null}

        {!editStatusId ? (
          <View>
            <Text secondary style={styles.label}>
              {t("compose.visibility")}
            </Text>
            <View style={styles.settingPills}>
              {(
                [
                  ["public", t("compose.public")],
                  ["unlisted", t("compose.unlisted")],
                  ["private", t("compose.followers")],
                  ["direct", t("compose.mentioned")],
                ] as const
              ).map(([id, label]) => (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: draft.visibility === id }}
                  key={id}
                  onPress={() => updateDraft({ visibility: id })}
                  style={[
                    styles.pill,
                    draft.visibility === id && { backgroundColor: theme.tint },
                  ]}
                >
                  <Text
                    style={
                      draft.visibility === id
                        ? { color: theme.onTint }
                        : undefined
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.settingPills}>
          <ComposeToggle
            checked={draft.contentWarningEnabled}
            label={t("compose.contentWarning")}
            onPress={() =>
              updateDraft({
                contentWarningEnabled: !draft.contentWarningEnabled,
              })
            }
          />
          <ComposeToggle
            checked={draft.sensitive}
            label={t("compose.sensitiveMedia")}
            onPress={() => updateDraft({ sensitive: !draft.sensitive })}
          />
          <ComposeToggle
            checked={draft.pollEnabled}
            label={t("compose.poll")}
            onPress={() => updateDraft({ pollEnabled: !draft.pollEnabled })}
          />
        </View>

        {draft.contentWarningEnabled ? (
          <TextInput
            accessibilityLabel={t("compose.warningText")}
            maxLength={500}
            onChangeText={contentWarning => updateDraft({ contentWarning })}
            placeholder={t("compose.warningPlaceholder")}
            style={styles.warningInput}
            value={draft.contentWarning}
          />
        ) : null}
        <TextInput
          accessibilityLabel={t("compose.postText")}
          maxLength={5_000}
          multiline
          onChangeText={content => updateDraft({ content })}
          placeholder={
            replyId
              ? t("compose.replyPlaceholder")
              : quoteId
                ? t("compose.quotePlaceholder")
                : t("compose.postPlaceholder")
          }
          style={[styles.input, { color: theme.text }]}
          value={draft.content}
        />
        <View style={styles.metadataRow}>
          <TextInput
            accessibilityLabel={t("compose.language")}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            onChangeText={language => updateDraft({ language })}
            placeholder={t("compose.languagePlaceholder")}
            style={styles.languageInput}
            value={draft.language || ""}
          />
          <Text secondary style={styles.count}>
            {draft.content.length}/5000
          </Text>
        </View>
        <View style={styles.mediaHeading}>
          <Text style={styles.mediaTitle}>{t("compose.media")}</Text>
          <AppButton
            color={theme.secondaryTint}
            disabled={draft.media.length >= 4 || submitting}
            onPress={() => void chooseMedia()}
            title={
              draft.media.length >= 4
                ? t("compose.fourAttachments")
                : t("compose.addMedia")
            }
          />
        </View>
        {draft.media.map((media, index) => (
          <View
            key={media.id || media.uri || `attachment-${index}`}
            style={[styles.mediaRow, { borderColor: theme.tertiaryBackground }]}
          >
            {media.uri && media.mimeType?.startsWith("image/") ? (
              <Image source={{ uri: media.uri }} style={styles.mediaPreview} />
            ) : (
              <View
                style={[
                  styles.mediaPreview,
                  styles.mediaFallback,
                  { backgroundColor: theme.secondaryBackground },
                ]}
              >
                <Text secondary>
                  {media.mimeType?.startsWith("video/")
                    ? t("compose.video")
                    : t("compose.media")}
                </Text>
              </View>
            )}
            <View style={styles.mediaBody}>
              <TextInput
                accessibilityLabel={t("compose.attachmentDescription", {
                  number: index + 1,
                })}
                maxLength={1_500}
                multiline
                onChangeText={description =>
                  updateDraft({
                    media: draft.media.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, description } : item,
                    ),
                  })
                }
                placeholder={t("compose.mediaDescriptionPlaceholder")}
                style={styles.mediaDescriptionInput}
                value={media.description}
              />
              <Pressable
                accessibilityLabel={t("compose.removeAttachment", {
                  number: index + 1,
                })}
                accessibilityRole="button"
                onPress={() => {
                  removeComposeDraftMedia(media);
                  updateDraft({
                    media: draft.media.filter(
                      (_item, itemIndex) => itemIndex !== index,
                    ),
                  });
                }}
                style={styles.removeMedia}
              >
                <Text style={{ color: theme.red }}>{t("compose.remove")}</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {draft.media.length > 0 &&
        draft.media.some(media => !media.description.trim()) ? (
          <Text secondary>{t("compose.altReminder")}</Text>
        ) : null}
        {draft.media.length > 0 && draft.pollEnabled ? (
          <Text style={{ color: theme.red }}>
            {t("compose.pollMediaConflict")}
          </Text>
        ) : null}
        {draft.pollEnabled ? (
          <ComposePollFields
            draft={draft.poll}
            onChange={poll => updateDraft({ poll })}
          />
        ) : null}
        {!replyId && !quoteId && !editStatusId ? (
          <ComposeScheduleFields
            onChange={scheduledAt => updateDraft({ scheduledAt })}
            value={draft.scheduledAt}
          />
        ) : null}
        {!scheduleValid ? (
          <Text accessibilityLiveRegion="polite" style={{ color: theme.red }}>
            {t("compose.futureTime")}
          </Text>
        ) : null}

        <View style={styles.submitActions}>
          <AppButton
            color={theme.secondaryTint}
            disabled={!isMeaningfulComposeDraft(draft) || submitting}
            onPress={() => void saveDraft()}
            title={t("compose.saveDraft")}
          />
          <AppButton
            color={theme.tint}
            disabled={!formValid}
            fullWidth
            onPress={() => void submit()}
            style={styles.primaryAction}
            title={
              submitting
                ? t("compose.saving")
                : editStatusId
                  ? t("compose.saveChanges")
                  : draft.scheduledAt
                    ? t("compose.schedule")
                    : replyId
                      ? t("compose.reply")
                      : quoteId
                        ? t("compose.publishQuote")
                        : draft.targetAccountKeys.length > 1
                          ? t("compose.publishAccounts", {
                              count: draft.targetAccountKeys.length,
                            })
                          : t("compose.publish")
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function activeKey(ctx: LotideContext): string[] {
  const key = accountStoreKeyForContext(ctx);
  return key ? [key] : [];
}

function ComposeToggle({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[
        styles.toggle,
        checked && { backgroundColor: theme.tertiaryBackground },
      ]}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 12, padding: 16 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  heading: { flex: 1, fontSize: 23, fontWeight: "700" },
  headerAction: {
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  replyTarget: { borderRadius: 10, gap: 3, padding: 12 },
  targetLabel: { fontSize: 13, fontWeight: "700" },
  targetAuthor: { fontWeight: "700" },
  label: { marginBottom: 6 },
  groupPicker: { gap: 8 },
  settingPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderRadius: 19,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  toggle: {
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 13,
  },
  warningInput: { minHeight: 48 },
  input: {
    fontSize: 17,
    minHeight: 180,
    padding: 12,
    textAlignVertical: "top",
  },
  metadataRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  languageInput: { flex: 1, minHeight: 44 },
  count: { textAlign: "right" },
  mediaHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mediaTitle: { fontSize: 17, fontWeight: "700" },
  mediaRow: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 9,
  },
  mediaPreview: { borderRadius: 8, height: 90, width: 90 },
  mediaFallback: { alignItems: "center", justifyContent: "center" },
  mediaBody: { flex: 1, gap: 5 },
  mediaDescriptionInput: { minHeight: 62, textAlignVertical: "top" },
  removeMedia: {
    alignItems: "center",
    alignSelf: "flex-end",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  submitActions: { alignItems: "stretch", flexDirection: "row", gap: 8 },
  primaryAction: { flex: 1 },
});

/* end of ComposeStatusScreen.tsx */
