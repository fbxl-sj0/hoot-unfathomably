/*
    Project: Hoot Mobile
    -------------------

    File: CommentScreen.tsx

    Purpose:

        Compose a reply to a post or comment.

    Responsibilities:

        - Display the target content context
        - Submit comment markdown
        - Navigate back after posting

    This file intentionally does NOT contain:

        - comment tree rendering
        - post feed loading
*/

import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import AppButton from "../components/AppButton";
import { Text, TextInput } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { RootStackScreenProps } from "../types";
import * as LotideService from "../services/LotideService";
import ContentDisplay from "../components/ContentDisplay";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { getErrorMessage } from "../utils/error";

export default function CommentScreen({
  navigation,
  route,
}: RootStackScreenProps<"Comment">) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const theme = useTheme();
  const ctx = useLotideCtx();
  const id = route.params.id;
  const postId = route.params.postId;
  const title = route.params.title;
  const html = route.params.html;
  const type = route.params.type;
  const trimmedText = text.trim();
  const canSubmit = !!ctx?.login && !!trimmedText && !isSubmitting;

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      isSubmittingRef.current = false;
    };
  }, []);

  function alertIfMounted(title: string, message: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  function submit() {
    if (!ctx?.login || !trimmedText || isSubmittingRef.current) return;

    const onFailure = (error: unknown) => {
      alertIfMounted("Could not submit comment", getErrorMessage(error));

      if (isMountedRef.current) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    };
    const targetPostId = type === "post" ? id : postId;
    const navigateToSubmittedComment = (commentId: CommentId) => {
      if (!isMountedRef.current) return;

      if (!targetPostId) {
        navigation.pop();
        return;
      }

      navigation.navigate("Post", {
        postId: targetPostId,
        highlightedComments: [commentId],
      });
    };

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    if (type === "post") {
      LotideService.commentOnPost(ctx, id, trimmedText)
        .then(result => navigateToSubmittedComment(result.id))
        .catch(onFailure);
    } else {
      LotideService.commentOnComment(ctx, id, trimmedText)
        .then(navigateToSubmittedComment)
        .catch(onFailure);
    }
  }

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView ref={scrollRef}>
        <Pressable
          style={styles.root}
          onPress={() => Platform.OS !== "web" && Keyboard.dismiss()}
        >
          <Text>Reply to {type}</Text>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!html && <ContentDisplay contentHtml={html} />}
          <TextInput
            accessibilityLabel="Comment"
            style={styles.input}
            multiline
            placeholder="Type your comment"
            value={text}
            onChangeText={setText}
            onFocus={scrollToBottom}
          />
          <AppButton
            title={isSubmitting ? "Submitting..." : "Submit"}
            accessibilityLabel="Submit comment"
            color={theme.tint}
            disabled={!canSubmit}
            onPress={submit}
            fullWidth
          />
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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

/* end of CommentScreen.tsx */
