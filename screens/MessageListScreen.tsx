/*
    Project: Hoot Mobile
    -------------------

    File: MessageListScreen.tsx

    Purpose:

        Display the Lotide private-message conversation list.

    Responsibilities:

        - Gate the inbox behind the Lotide 0.18 private-message capability
        - Load one preview row per active conversation
        - Page through large conversation lists without duplicate rows
        - Open conversation threads
        - Dismiss conversations until new activity arrives

    This file intentionally does NOT contain:

        - Thread-level message composition
        - Notification polling
        - User profile editing
*/

import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet } from "react-native";
import { ActorDisplay } from "../components/ActorDisplay";
import ContentDisplay from "../components/ContentDisplay";
import ElapsedTime from "../components/ElapsedTime";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, View } from "../components/Themed";
import { supportsPrivateMessages } from "../constants/LotideApi";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useTheme from "../hooks/useTheme";
import * as LotideService from "../services/LotideService";
import { RootTabScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

export default function MessageListScreen({
  navigation,
}: RootTabScreenProps<"MessageListScreen">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const listRequestId = useRef(0);
  const nextPageRequestKey = useRef<string | null>(null);
  const dismissedConversationWatermarks = useRef(
    new Map<UserId, PrivateMessageId>(),
  );
  const canUseMessages = supportsPrivateMessages(ctx?.apiVersion);
  const loginUserId = ctx?.login?.user?.id;
  const messageScopeKey = `${ctx?.apiUrl ?? ""}::${ctx?.login?.token ?? ""}`;

  useEffect(
    () => navigation.addListener("focus", () => setReloadId(x => x + 1)),
    [navigation],
  );

  useEffect(() => {
    if (!ctx?.login || !canUseMessages) return;

    let isActive = true;
    const requestId = listRequestId.current + 1;

    listRequestId.current = requestId;
    nextPageRequestKey.current = null;

    LotideService.getPrivateMessageConversations(ctx)
      .then(data => {
        if (!isActive || requestId !== listRequestId.current) return;
        setMessages(
          filterDismissedConversationPreviews(
            data.items,
            loginUserId,
            dismissedConversationWatermarks.current,
          ),
        );
        setNextPage(data.next_page);
        setLoadError("");
        setHasLoaded(true);
      })
      .catch(() => {
        if (!isActive || requestId !== listRequestId.current) return;
        setLoadError("Cannot load messages");
        setHasLoaded(true);
      })
      .finally(() => {
        if (isActive && requestId === listRequestId.current) {
          setIsRefreshing(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [canUseMessages, ctx, loginUserId, messageScopeKey, reloadId]);

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

  function refresh() {
    nextPageRequestKey.current = null;
    setLoadError("");
    setHasLoaded(false);
    setIsRefreshing(true);
    setReloadId(x => x + 1);
  }

  function loadNextPage() {
    if (!ctx?.login || !nextPage) return;

    const requestPageKey = `${messageScopeKey}::${nextPage}`;

    if (nextPageRequestKey.current === requestPageKey) return;

    nextPageRequestKey.current = requestPageKey;
    const requestId = listRequestId.current;

    LotideService.getPrivateMessageConversations(ctx, nextPage)
      .then(data => {
        if (requestId !== listRequestId.current) return;

        setMessages(previousMessages =>
          mergeConversationPreviews(
            previousMessages,
            filterDismissedConversationPreviews(
              data.items,
              loginUserId,
              dismissedConversationWatermarks.current,
            ),
            loginUserId,
          ),
        );
        setNextPage(data.next_page);
        setLoadError("");
      })
      .catch(() => {
        if (requestId !== listRequestId.current) return;

        setLoadError("Cannot load messages");
      })
      .finally(() => {
        if (nextPageRequestKey.current === requestPageKey) {
          nextPageRequestKey.current = null;
        }
      });
  }

  function dismissConversation(
    partnerId: UserId,
    latestMessageId: PrivateMessageId,
  ) {
    const previousDismissedMessageId =
      dismissedConversationWatermarks.current.get(partnerId);

    if (
      previousDismissedMessageId === undefined ||
      latestMessageId > previousDismissedMessageId
    ) {
      dismissedConversationWatermarks.current.set(partnerId, latestMessageId);
    }

    setMessages(previousMessages =>
      filterDismissedConversationPreviews(
        previousMessages,
        loginUserId,
        dismissedConversationWatermarks.current,
      ),
    );
    refresh();
  }

  function renderItem({ item }: { item: PrivateMessage }) {
    const partner = LotideService.getPrivateMessagePartner(
      item,
      loginUserId,
    );

    return (
      <ConversationRow
        message={item}
        partner={partner}
        onOpen={() =>
          navigation.navigate("MessageThread", {
            userId: partner.id,
            username: partner.username,
          })
        }
        onDismiss={() => dismissConversation(partner.id, item.id)}
      />
    );
  }

  return (
    <FlatList
      testID="message-list"
      style={[styles.root, { backgroundColor: theme.background }]}
      data={messages}
      keyExtractor={item => String(item.id)}
      renderItem={renderItem}
      refreshing={isRefreshing}
      onRefresh={refresh}
      onEndReached={loadNextPage}
      onEndReachedThreshold={1.5}
      ListHeaderComponent={
        messages.length > 0 && loadError ? (
          <View style={styles.inlineError}>
            <RetryState compact message={loadError} onRetry={refresh} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        hasLoaded ? (
          <View style={styles.empty}>
            {loadError ? (
              <RetryState compact message={loadError} onRetry={refresh} />
            ) : (
              <Text style={{ color: theme.secondaryText }}>No messages yet</Text>
            )}
          </View>
        ) : null
      }
    />
  );
}

function mergeConversationPreviews(
  currentMessages: PrivateMessage[],
  incomingMessages: PrivateMessage[],
  loginUserId?: UserId,
) {
  const seen = new Set(
    currentMessages.map(message =>
      conversationPreviewKey(message, loginUserId),
    ),
  );
  const merged = [...currentMessages];

  incomingMessages.forEach(message => {
    const key = conversationPreviewKey(message, loginUserId);

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(message);
    }
  });

  return merged;
}

function conversationPreviewKey(
  message: PrivateMessage,
  loginUserId?: UserId,
) {
  return String(
    LotideService.getPrivateMessagePartner(message, loginUserId).id,
  );
}

function filterDismissedConversationPreviews(
  messages: PrivateMessage[],
  loginUserId: UserId | undefined,
  dismissedConversationMessageIds: Map<UserId, PrivateMessageId>,
) {
  return messages.filter(message => {
    const partner = LotideService.getPrivateMessagePartner(
      message,
      loginUserId,
    );
    const dismissedMessageId = dismissedConversationMessageIds.get(partner.id);

    if (dismissedMessageId === undefined) return true;

    /*
        Dismissal is a conversation-level action "until new activity". If a
        follow-up inbox reload races and returns the old preview, keep it out
        locally. A newer message id from the same partner is treated as new
        activity and clears the local suppression.
    */
    if (message.id <= dismissedMessageId) return false;

    dismissedConversationMessageIds.delete(partner.id);
    return true;
  });
}

function ConversationRow({
  message,
  partner,
  onOpen,
  onDismiss,
}: {
  message: PrivateMessage;
  partner: Profile;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const sentByMe = message.author.id === ctx?.login?.user?.id;
  const [isDismissing, setIsDismissing] = useState(false);
  const isMountedRef = useRef(true);
  const isDismissingRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      isDismissingRef.current = false;
    };
  }, []);

  function dismiss() {
    if (!ctx?.login || isDismissingRef.current) return;

    isDismissingRef.current = true;
    setIsDismissing(true);

    LotideService.dismissPrivateMessageConversation(ctx, partner.id)
      .then(() => {
        if (!isMountedRef.current) return;

        onDismiss();
      })
      .catch(error => {
        if (!isMountedRef.current) return;

        Alert.alert(
          "Could not dismiss conversation",
          getErrorMessage(error),
        );
      })
      .finally(() => {
        isDismissingRef.current = false;

        if (isMountedRef.current) {
          setIsDismissing(false);
        }
      });
  }

  return (
    <Pressable
      accessibilityLabel={`Open conversation with ${partner.username}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={[
        styles.row,
        {
          borderBottomColor: theme.secondaryBackground,
        },
      ]}
    >
      <View style={styles.rowHeader}>
        <ActorDisplay
          name={partner.username}
          host={partner.host}
          local={partner.local ?? false}
          showHost="only_foreign"
          colorize="only_foreign"
          userId={partner.id}
        />
        <ElapsedTime time={message.created} />
      </View>
      <Text style={{ color: theme.secondaryText, marginTop: 6 }}>
        {sentByMe ? "You: " : ""}
      </Text>
      <ContentDisplay
        contentHtml={message.content_html}
        contentMarkdown={message.content_markdown}
        contentText={message.content_text}
        maxChars={220}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={`Dismiss conversation with ${partner.username}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDismissing }}
          disabled={isDismissing}
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          onPress={dismiss}
          style={[
            styles.dismissButton,
            isDismissing && styles.disabledButton,
            { backgroundColor: theme.secondaryBackground },
          ]}
        >
          <Text style={{ color: theme.text }}>
            {isDismissing ? "Dismissing..." : "Dismiss"}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
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
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth || 1,
    padding: 16,
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actions: {
    alignItems: "flex-start",
    marginTop: 12,
  },
  dismissButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  empty: {
    padding: 24,
  },
  inlineError: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});

/* end of MessageListScreen.tsx */
