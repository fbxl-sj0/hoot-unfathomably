/*
    Project: Hoot Mobile
    -------------------

    File: NewPostScreen.tsx

    Purpose:

        Compose and submit a new Lotide post.

    Responsibilities:

        - Choose a target community
        - Collect title, URL, and markdown body
        - Store and navigate to the created post

    This file intentionally does NOT contain:

        - community browsing tabs
        - comment composition
*/

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
} from "react-native";
import { View, Text, TextInput as TextInputThemed } from "../components/Themed";
import AppButton from "../components/AppButton";
import { RootTabScreenProps } from "../types";
import * as LotideService from "../services/LotideService";
import useTheme from "../hooks/useTheme";
import SuggestLogin from "../components/SuggestLogin";
import CommunityFinder from "../components/CommunityFinder";
import ActorDisplayComponent from "../components/ActorDisplay";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { useDispatch } from "react-redux";
import { setPost } from "../slices/postSlice";
import { getErrorMessage } from "../utils/error";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";

export default function NewPostScreen({
  navigation,
  route,
}: RootTabScreenProps<"NewPostScreen">) {
  const dispatch = useDispatch();
  const [community, setCommunity] = useState<Community | null | undefined>(
    route.params.community,
  );
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const theme = useTheme();
  const ctx = useLotideCtx();
  const titleLength = title.trim().length;

  useEffect(() => {
    return navigation.addListener("focus", () => {
      if (route.params.community) {
        return setCommunity(route.params.community);
      }
      setCommunity(existingCommunity =>
        existingCommunity === null ? undefined : existingCommunity,
      );
    });
  }, [navigation, route.params.community, route.params.community?.id]);

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      isSubmittingRef.current = false;
    };
  }, []);

  if (!ctx?.login) {
    return <SuggestLogin />;
  }

  if (community === null)
    return <CommunityFinder onSelect={setCommunity} />;

  function alertIfMounted(title: string, message: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  async function submit() {
    if (isSubmittingRef.current) return;
    if (!ctx || !community) return;

    const trimmedTitle = title.trim();
    const trimmedLink = link.trim();

    if (trimmedTitle.length < 4) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const data = await LotideService.submitPost(ctx, {
        community: community.id,
        title: trimmedTitle,
        href: trimmedLink || undefined,
        content_markdown: content.trim() || " ",
      });
      const post = await LotideService.getPost(ctx, data.id);

      if (!isMountedRef.current) return;

      reset();
      dispatch(setPost({ post }));
      navigation.navigate("Post", { postId: post.id });
    } catch (e) {
      alertIfMounted("Could not submit post", getErrorMessage(e));
    } finally {
      isSubmittingRef.current = false;

      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  function reset() {
    setCommunity(undefined);
    setTitle("");
    setLink("");
    setContent("");
  }

  return (
    <KeyboardAvoidingView style={{ width: "100%", height: "100%" }}>
      <TouchableWithoutFeedback
        onPress={() => Platform.OS !== "web" && Keyboard.dismiss()}
      >
        <View style={styles.container}>
          <Pressable
            accessibilityLabel="Select community"
            accessibilityRole="button"
            onPress={() => setCommunity(null)}
            style={styles.communitySelector}
          >
            {community ? (
              <ActorDisplayComponent
                name={community.name}
                host={community.host}
                local={community.local}
                colorize={"always"}
                showHost={"always"}
                newLine
                style={styles.input}
              />
            ) : (
              <Text style={[styles.input, { color: theme.secondaryText }]}>
                Select a Community
              </Text>
            )}
          </Pressable>
          <TextInput
            style={[styles.input, styles.title, { color: theme.text }]}
            placeholder="Add a Title"
            placeholderTextColor={theme.placeholderText}
            value={title}
            onChangeText={setTitle}
          />
          {titleLength >= 4 ? (
            <>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Link"
                placeholderTextColor={theme.placeholderText}
                value={link}
                onChangeText={setLink}
                keyboardType="url"
                textContentType="URL"
              />
              <TextInputThemed
                style={{ marginVertical: 20, minHeight: 100 }}
                multiline
                placeholder="Add post content"
                value={content}
                onChangeText={setContent}
              />
            </>
          ) : (
            <Text style={{ color: theme.secondaryText }}>
              {titleLength > 0 && 4 - titleLength}
            </Text>
          )}
          {!!community && titleLength >= 4 && (
            <AppButton
              onPress={() => {
                void submit();
              }}
              title={isSubmitting ? "Submitting..." : "Submit"}
              color={theme.tint}
              accessibilityLabel="Submit new post"
              disabled={isSubmitting}
              fullWidth
            />
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
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
  communitySelector: {
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    justifyContent: "center",
  },
  item: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 1,
  },
});

/* end of NewPostScreen.tsx */
