/*
    Project: Hoot Mobile
    -------------------

    File: MessageThreadScreen.tsx

    Purpose:

        Display and compose a private-message conversation.

    Responsibilities:

        - Gate conversation threads behind the Lotide 0.18 message capability
        - Load messages with a single other user
        - Page through longer conversations without duplicate messages
        - Render messages in chronological order
        - Send replies to the current conversation

    This file intentionally does NOT contain:

        - Conversation-list dismissal controls
        - Notification polling
        - Rich text editing
*/

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import AppButton from "../components/AppButton";
import { ActorDisplay } from "../components/ActorDisplay";
import ContentDisplay from "../components/ContentDisplay";
import ElapsedTime from "../components/ElapsedTime";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import { supportsPrivateMessages } from "../constants/LotideApi";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useTheme from "../hooks/useTheme";
import * as LotideService from "../services/LotideService";
import { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

export default function MessageThreadScreen({
  route,
}: RootStackScreenProps<"MessageThread">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const userId = parseFiniteNumber(route.params?.userId);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loadError, setLoadError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [nextPageState, setNextPageState] = useState({
    threadScopeKey: "",
    nextPage: null as string | null,
  });
  const [loadingPageKey, setLoadingPageKey] = useState<string | null>(null);
  const threadRequestId = useRef(0);
  const nextPageRequestKey = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const isSendingRef = useRef(false);
  const canUseMessages = supportsPrivateMessages(ctx?.apiVersion);
  const threadScopeKey = `${ctx?.apiUrl ?? ""}::${ctx?.login?.token ?? ""}::${userId ?? ""}`;
  const nextPage = nextPageState.threadScopeKey === threadScopeKey
    ? nextPageState.nextPage
    : null;
  const activePageKey = nextPage ? `${threadScopeKey}::${nextPage}` : null;
  const isLoadingNextPage = !!activePageKey && loadingPageKey === activePageKey;
  const displayMessages = useMemo(
    () => [...messages].sort(compareMessagesChronologically),
    [messages],
  );
  const latestMessageId = displayMessages[displayMessages.length - 1]?.id;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      isSendingRef.current = false;
      nextPageRequestKey.current = null;
      threadRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!ctx?.login || !canUseMessages || !userId) return;

    let isActive = true;
    const requestId = threadRequestId.current + 1;

    threadRequestId.current = requestId;
    nextPageRequestKey.current = null;

    LotideService.getPrivateMessageThread(ctx, userId)
      .then(data => {
        if (!isActive || requestId !== threadRequestId.current) return;
        setMessages(data.items);
        setNextPageState({ threadScopeKey, nextPage: data.next_page });
        setLoadError("");
        setHasLoaded(true);
      })
      .catch(() => {
        if (!isActive || requestId !== threadRequestId.current) return;
        setLoadError("Cannot load conversation");
        setNextPageState({ threadScopeKey, nextPage: null });
        setHasLoaded(true);
      })
      .finally(() => {
        if (isActive && requestId === threadRequestId.current) {
          setIsRefreshing(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [canUseMessages, ctx, reloadId, threadScopeKey, userId]);

  if (!ctx?.login) {
    return <SuggestLogin />;
  }

  if (!canUseMessages) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>
          This Lotide server does not provide private messages yet.
        </Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>Cannot load conversation</Text>
      </View>
    );
  }

  function refresh() {
    threadRequestId.current += 1;
    nextPageRequestKey.current = null;
    setLoadError("");
    setHasLoaded(false);
    setIsRefreshing(true);
    setLoadingPageKey(null);
    setNextPageState({ threadScopeKey, nextPage: null });
    setReloadId(x => x + 1);
  }

  function loadNextPage() {
    if (!ctx?.login || !userId || !nextPage) return;

    const requestPageKey = `${threadScopeKey}::${nextPage}`;

    if (nextPageRequestKey.current === requestPageKey) return;

    const requestId = threadRequestId.current;

    nextPageRequestKey.current = requestPageKey;
    setLoadingPageKey(requestPageKey);

    LotideService.getPrivateMessageThread(ctx, userId, nextPage)
      .then(data => {
        if (!isMountedRef.current || requestId !== threadRequestId.current) {
          return;
        }

        setMessages(existing => mergePrivateMessages(existing, data.items));
        setNextPageState({ threadScopeKey, nextPage: data.next_page });
        setLoadError("");
      })
      .catch(() => {
        if (!isMountedRef.current || requestId !== threadRequestId.current) {
          return;
        }

        setLoadError("Cannot load conversation");
      })
      .finally(() => {
        if (isMountedRef.current && nextPageRequestKey.current === requestPageKey) {
          nextPageRequestKey.current = null;
          setLoadingPageKey(existing =>
            existing === requestPageKey ? null : existing,
          );
        }
      });
  }

  function send() {
    if (!ctx?.login || !draft.trim() || !userId || isSendingRef.current) return;

    isSendingRef.current = true;
    setIsSending(true);
    LotideService.sendPrivateMessage(
      ctx,
      userId,
      draft.trim(),
      latestMessageId,
    )
      .then(message => {
        if (!isMountedRef.current) return;

        setMessages(existing => upsertPrivateMessage(existing, message));
        setDraft("");
        refresh();
      })
      .catch(error => {
        if (!isMountedRef.current) return;

        Alert.alert("Could not send message", getErrorMessage(error));
      })
      .finally(() => {
        isSendingRef.current = false;

        if (isMountedRef.current) {
          setIsSending(false);
        }
      });
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        testID="message-thread-scroll"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.tint}
            colors={[theme.tint]}
          />
        }
      >
        {loadError ? (
          <RetryState compact message={loadError} onRetry={refresh} />
        ) : null}
        {!loadError && !hasLoaded && messages.length === 0 ? (
          <Text style={{ color: theme.secondaryText }}>Loading conversation</Text>
        ) : null}
        {hasLoaded && !loadError && messages.length === 0 ? (
          <Text style={{ color: theme.secondaryText }}>
            No messages in this conversation yet.
          </Text>
        ) : null}
        {nextPage ? (
          <AppButton
            title={isLoadingNextPage ? "Loading earlier..." : "Load earlier messages"}
            accessibilityLabel="Load earlier messages"
            color={theme.secondaryBackground}
            disabled={isLoadingNextPage}
            fullWidth
            onPress={loadNextPage}
            style={styles.loadEarlierButton}
            textColor={theme.text}
          />
        ) : null}
        {displayMessages.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.author.id === ctx.login?.user?.id}
          />
        ))}
      </ScrollView>
      <View
        style={[
          styles.composer,
          {
            borderTopColor: theme.secondaryBackground,
            backgroundColor: theme.background,
          },
        ]}
      >
        <TextInput
          accessibilityLabel="Message"
          multiline
          placeholder="Message"
          placeholderTextColor={theme.placeholderText}
          value={draft}
          onChangeText={setDraft}
          style={[
            styles.input,
            {
              borderColor: theme.tertiaryBackground,
              color: theme.text,
            },
          ]}
        />
        <AppButton
          title="Send"
          accessibilityLabel="Send message"
          disabled={isSending || !draft.trim()}
          onPress={send}
          fullWidth
          style={styles.sendButton}
        />
      </View>
    </View>
  );
}

function MessageBubble({
  message,
  isMine,
}: {
  message: PrivateMessage;
  isMine: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.message,
        isMine ? styles.mine : styles.theirs,
        {
          backgroundColor: isMine
            ? theme.secondaryBackground
            : theme.background,
          borderColor: isMine ? theme.tertiaryBackground : theme.secondaryBackground,
        },
      ]}
    >
      <View style={styles.messageHeader}>
        <ActorDisplay
          name={message.author.username}
          host={message.author.host}
          local={message.author.local ?? false}
          showHost="only_foreign"
          colorize="only_foreign"
          userId={message.author.id}
        />
        <ElapsedTime time={message.created} />
      </View>
      <ContentDisplay
        contentHtml={message.content_html}
        contentMarkdown={message.content_markdown}
        contentText={message.content_text}
      />
      {!!message.federation_status && (
        <Text style={{ color: theme.secondaryText, marginTop: 6 }}>
          federation: {message.federation_status}
        </Text>
      )}
    </View>
  );
}

function compareMessagesChronologically(
  left: PrivateMessage,
  right: PrivateMessage,
) {
  const leftTime = Date.parse(left.created);
  const rightTime = Date.parse(right.created);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime || left.id - right.id;
  }

  return left.id - right.id;
}

function upsertPrivateMessage(
  existing: PrivateMessage[],
  message: PrivateMessage,
) {
  const index = existing.findIndex(item => item.id === message.id);

  if (index < 0) {
    return [...existing, message];
  }

  return [
    ...existing.slice(0, index),
    message,
    ...existing.slice(index + 1),
  ];
}

function mergePrivateMessages(
  existing: PrivateMessage[],
  incoming: PrivateMessage[],
) {
  const seenIds = new Set(existing.map(message => message.id));
  const merged = [...existing];

  incoming.forEach(message => {
    if (seenIds.has(message.id)) return;

    seenIds.add(message.id);
    merged.push(message);
  });

  return merged;
}

function parseFiniteNumber(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  loadEarlierButton: {
    marginBottom: 12,
  },
  message: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth || 1,
    marginBottom: 12,
    maxWidth: "94%",
    padding: 12,
  },
  mine: {
    alignSelf: "flex-end",
  },
  theirs: {
    alignSelf: "flex-start",
  },
  messageHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth || 1,
    padding: 12,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth || 1,
    maxHeight: 140,
    minHeight: 52,
    padding: 12,
    textAlignVertical: "top",
  },
  sendButton: {
    marginTop: 10,
  },
});

/* end of MessageThreadScreen.tsx */
