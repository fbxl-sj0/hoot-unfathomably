/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeStatusScreen.tsx

    Purpose:

        Publish regular posts, replies, and group discussion posts.
*/

import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from "react-native";

import AppButton from "../components/AppButton";
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
    setTargetStatus(undefined);
    navigation.setParams?.({
      composeIntentId: undefined,
      groupId: undefined,
      groupName: undefined,
      inReplyToId: undefined,
      quoteId: undefined,
    });
  }

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const status = await Unfathomably.createStatus(ctx as LotideContext, content.trim(), { inReplyToId: replyId, quoteId, groupId });
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
    {!replyId && <View><Text secondary style={styles.label}>Post to</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupPicker}><Pressable accessibilityRole="button" onPress={() => setGroupId(undefined)} style={[styles.pill, !groupId && { backgroundColor: theme.tint }]}><Text style={!groupId ? { color: theme.background } : undefined}>My feed</Text></Pressable>{groups.map(group => <Pressable key={group.id} accessibilityRole="button" onPress={() => setGroupId(group.id)} style={[styles.pill, groupId === group.id && { backgroundColor: theme.tint }]}><Text style={groupId === group.id ? { color: theme.background } : undefined}>{group.display_name}</Text></Pressable>)}</ScrollView></View>}
    <TextInput multiline value={content} onChangeText={setContent} placeholder={replyId ? "Write a reply" : quoteId ? "Add your thoughts" : "What's happening?"} style={[styles.input, { color: theme.text }]} maxLength={5000} />
    <Text secondary style={styles.count}>{content.length}/5000</Text>
    <AppButton title={submitting ? "Publishing..." : replyId ? "Reply" : quoteId ? "Publish quote" : "Publish"} onPress={() => void submit()} disabled={submitting || !content.trim()} color={theme.tint} fullWidth />
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, content: { padding: 16, gap: 12 }, heading: { fontSize: 23, fontWeight: "700" }, replyTarget: { borderRadius: 10, gap: 3, padding: 12 }, targetLabel: { fontSize: 13, fontWeight: "700" }, targetAuthor: { fontWeight: "700" }, label: { marginBottom: 6 }, groupPicker: { gap: 8 }, pill: { borderRadius: 17, paddingHorizontal: 12, paddingVertical: 7 }, input: { minHeight: 180, fontSize: 17, textAlignVertical: "top", padding: 12 }, count: { textAlign: "right" } });

/* end of ComposeStatusScreen.tsx */
