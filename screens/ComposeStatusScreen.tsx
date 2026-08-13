/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeStatusScreen.tsx

    Purpose:

        Publish regular posts, replies, and group discussion posts.

    Responsibilities:

        - Isolate every compose intent so group and reply state cannot leak
        - Publish text, content warnings, visibility, sensitivity, and polls
        - Preview reply and quote targets before submission
        - Select a server-visible group only after an explicit user choice

    This file intentionally does NOT contain:

        - media upload transport
        - timeline rendering
        - server-side visibility or group policy decisions
*/

import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
import ComposePollFields, {
  ComposePollDraft,
  INITIAL_POLL_DRAFT,
  pollDraftIsValid,
} from "../components/ComposePollFields";
import SuggestLogin from "../components/SuggestLogin";
import { stripHtml } from "../components/StatusCard";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import * as Unfathomably from "../services/UnfathomablyService";

type ComposeRouteParams = {
  composeIntentId?: string;
  groupId?: string;
  groupName?: string;
  inReplyToId?: string;
  quoteId?: string;
  quoteParameter?: Unfathomably.QuoteParameter;
};

export default function ComposeStatusScreen({ navigation, route }: { navigation: any; route: { params?: ComposeRouteParams } }) {
  const ctx = useLotideCtx();
  if (!ctx?.login) return <SuggestLogin />;

  const params = route.params || {};
  const intentKey = [
    ctx.apiUrl,
    params.composeIntentId || "route",
    params.groupId || "",
    params.inReplyToId || "",
    params.quoteId || "",
    params.quoteParameter || "",
  ].join(":");

  return (
    <ComposeStatusForm
      key={intentKey}
      ctx={ctx}
      navigation={navigation}
      params={params}
    />
  );
}

function ComposeStatusForm({
  ctx,
  navigation,
  params,
}: {
  ctx: LotideContext;
  navigation: any;
  params: ComposeRouteParams;
}) {
  const theme = useTheme();
  const replyId = params.inReplyToId;
  const quoteId = params.quoteId;
  const targetId = replyId || quoteId;
  const [content, setContent] = useState("");
  const [groups, setGroups] = useState<Unfathomably.UnfathomablyGroup[]>([]);
  const [groupId, setGroupId] = useState(params.groupId);
  const [visibility, setVisibility] = useState(params.groupId ? "unlisted" : "public");
  const [contentWarningEnabled, setContentWarningEnabled] = useState(false);
  const [contentWarning, setContentWarning] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [poll, setPoll] = useState<ComposePollDraft>(INITIAL_POLL_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [targetStatus, setTargetStatus] = useState<Unfathomably.UnfathomablyStatus>();

  useEffect(() => {
    let active = true;
    void Unfathomably.getGroups(ctx)
      .then(next => {
        if (active) setGroups(next);
      })
      .catch(() => undefined);
    return () => { active = false; };
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
    return () => { active = false; };
  }, [ctx, targetId]);

  function clearComposeIntent() {
    setContent("");
    setGroupId(undefined);
    setVisibility("public");
    setContentWarningEnabled(false);
    setContentWarning("");
    setSensitive(false);
    setPollEnabled(false);
    setPoll(INITIAL_POLL_DRAFT);
    setTargetStatus(undefined);
    navigation.setParams?.({
      composeIntentId: undefined,
      groupId: undefined,
      groupName: undefined,
      inReplyToId: undefined,
      quoteId: undefined,
      quoteParameter: undefined,
    });
  }

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      let quoteParameter = params.quoteParameter;
      if (!quoteId) quoteParameter = undefined;
      else if (targetStatus) {
        quoteParameter = Unfathomably.getQuoteParameter(targetStatus);
      }

      const status = await Unfathomably.createStatus(ctx as LotideContext, content.trim(), {
        contentWarning: contentWarningEnabled ? contentWarning : undefined,
        groupId,
        inReplyToId: replyId,
        poll: pollEnabled ? poll : undefined,
        quoteId,
        quoteParameter,
        sensitive,
        visibility,
      });
      clearComposeIntent();
      navigation.navigate("Status", { statusId: status.id });
    } catch (reason) { Alert.alert("Could not publish", reason instanceof Error ? reason.message : "Try again."); }
    finally { setSubmitting(false); }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.heading}>{replyId ? "Reply" : quoteId ? "Quote repost" : groupId ? "New group post" : "New post"}</Text>
    {!!targetId && <View style={[styles.replyTarget, { backgroundColor: theme.secondaryBackground }]}>
      <Text secondary style={styles.targetLabel}>{replyId ? "Replying to" : "Quoting"}</Text>
      {targetStatus ? <><Text style={styles.targetAuthor}>{targetStatus.account.display_name || targetStatus.account.acct}</Text><Text numberOfLines={4}>{stripHtml((targetStatus.reblog || targetStatus).content)}</Text></> : <Text secondary>Loading post…</Text>}
    </View>}
    {!replyId && <View><Text secondary style={styles.label}>Post to</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupPicker}><Pressable accessibilityRole="button" onPress={() => { setGroupId(undefined); setVisibility("public"); }} style={[styles.pill, !groupId && { backgroundColor: theme.tint }]}><Text style={!groupId ? { color: theme.onTint } : undefined}>My feed</Text></Pressable>{groups.filter(group => group.relationship?.can_post !== false).map(group => <Pressable key={group.id} accessibilityRole="button" onPress={() => { setGroupId(group.id); setVisibility("unlisted"); }} style={[styles.pill, groupId === group.id && { backgroundColor: theme.tint }]}><Text style={groupId === group.id ? { color: theme.onTint } : undefined}>{group.display_name}</Text></Pressable>)}</ScrollView></View>}
    <View><Text secondary style={styles.label}>Visibility</Text><View style={styles.settingPills}>{[{ id: "public", label: "Public" }, { id: "unlisted", label: "Quiet public" }, { id: "private", label: "Followers" }].map(option => <Pressable accessibilityRole="radio" accessibilityState={{ checked: visibility === option.id }} key={option.id} onPress={() => setVisibility(option.id)} style={[styles.pill, visibility === option.id && { backgroundColor: theme.tint }]}><Text style={visibility === option.id ? { color: theme.onTint } : undefined}>{option.label}</Text></Pressable>)}</View></View>
    <View style={styles.settingPills}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: contentWarningEnabled }} onPress={() => setContentWarningEnabled(value => !value)} style={[styles.toggle, contentWarningEnabled && { backgroundColor: theme.tertiaryBackground }]}><Text>Content warning</Text></Pressable><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: sensitive }} onPress={() => setSensitive(value => !value)} style={[styles.toggle, sensitive && { backgroundColor: theme.tertiaryBackground }]}><Text>Sensitive media</Text></Pressable><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: pollEnabled }} onPress={() => setPollEnabled(value => !value)} style={[styles.toggle, pollEnabled && { backgroundColor: theme.tertiaryBackground }]}><Text>Poll</Text></Pressable></View>
    {contentWarningEnabled ? <TextInput accessibilityLabel="Content warning" value={contentWarning} onChangeText={setContentWarning} placeholder="Brief content warning" maxLength={500} style={styles.warningInput} /> : null}
    <TextInput multiline value={content} onChangeText={setContent} placeholder={replyId ? "Write a reply" : quoteId ? "Add your thoughts" : "What's happening?"} style={[styles.input, { color: theme.text }]} maxLength={5000} />
    <Text secondary style={styles.count}>{content.length}/5000</Text>
    {pollEnabled ? <ComposePollFields draft={poll} onChange={setPoll} /> : null}
    <AppButton title={submitting ? "Publishing..." : replyId ? "Reply" : quoteId ? "Publish quote" : "Publish"} onPress={() => void submit()} disabled={submitting || !content.trim() || (contentWarningEnabled && !contentWarning.trim()) || (pollEnabled && !pollDraftIsValid(poll))} color={theme.tint} fullWidth />
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, content: { padding: 16, gap: 12 }, heading: { fontSize: 23, fontWeight: "700" }, replyTarget: { borderRadius: 10, gap: 3, padding: 12 }, targetLabel: { fontSize: 13, fontWeight: "700" }, targetAuthor: { fontWeight: "700" }, label: { marginBottom: 6 }, groupPicker: { gap: 8 }, settingPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, pill: { borderRadius: 19, justifyContent: "center", minHeight: 44, paddingHorizontal: 13 }, toggle: { borderRadius: 9, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 }, warningInput: { minHeight: 48 }, input: { minHeight: 180, fontSize: 17, textAlignVertical: "top", padding: 12 }, count: { textAlign: "right" } });

/* end of ComposeStatusScreen.tsx */
