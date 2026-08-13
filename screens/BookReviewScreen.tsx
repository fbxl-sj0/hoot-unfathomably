/*
    Project: Hoot Unfathomably
    --------------------------

    File: BookReviewScreen.tsx

    Purpose:

        Publish federated reviews, comments, and quotations for a selected book.

    Responsibilities:

        - Collect the bounded fields accepted by the native books workflow
        - Distinguish quiet shelf management from public reading activity
        - Validate ratings, page references, visibility, and quotations
        - Open the resulting status discussion after publication

    This file intentionally does NOT contain:

        - shelf mutations
        - book discovery or provider requests
        - arbitrary ActivityPub object editing
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
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
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  createBookActivity,
  CreateBookActivityInput,
} from "../services/UnfathomablyBooksService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

type BookAction = CreateBookActivityInput["action"];
type BookVisibility = NonNullable<CreateBookActivityInput["visibility"]>;

const RATINGS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export default function BookReviewScreen({
  navigation,
  route,
}: RootStackScreenProps<"BookReview">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const book = route.params.book;
  const [action, setAction] = useState<BookAction>("review");
  const [content, setContent] = useState("");
  const [quote, setQuote] = useState("");
  const [page, setPage] = useState("");
  const [rating, setRating] = useState<number>();
  const [spoilerEnabled, setSpoilerEnabled] = useState(false);
  const [spoilerText, setSpoilerText] = useState("");
  const [visibility, setVisibility] = useState<BookVisibility>("public");
  const [submitting, setSubmitting] = useState(false);

  if (!ctx?.login) return <SuggestLogin />;

  async function submit() {
    if (submitting) return;
    const numericPage = page.trim() ? Number(page) : undefined;
    setSubmitting(true);
    try {
      const status = await createBookActivity(ctx as LotideContext, {
        action,
        book,
        content,
        page: numericPage,
        quote,
        rating,
        spoilerText: spoilerEnabled ? spoilerText : undefined,
        visibility,
      });
      navigation.replace("Status", { statusId: status.id });
    } catch (reason) {
      Alert.alert("Could not publish book activity", getErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  const missingRequiredContent =
    (action === "review" && !content.trim() && rating === undefined) ||
    (action === "comment" && !content.trim()) ||
    (action === "quote" && !quote.trim());

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.book, { backgroundColor: theme.secondaryBackground }]}>
          {book.image ? <Image source={{ uri: book.image }} style={styles.cover} /> : (
            <View style={[styles.coverPlaceholder, { backgroundColor: theme.tertiaryBackground }]}>
              <Icon color={theme.tint} name="book-outline" size={31} />
            </View>
          )}
          <View style={[styles.bookIdentity, { backgroundColor: theme.secondaryBackground }]}>
            <Text style={styles.title}>{book.title || "Selected book"}</Text>
            {book.subtitle ? <Text secondary>{book.subtitle}</Text> : null}
            {book.author ? <Text>by {book.author}</Text> : null}
          </View>
        </View>

        <Text secondary style={styles.label}>What are you sharing?</Text>
        <View style={styles.pills}>
          {([
            { id: "review", label: "Review" },
            { id: "comment", label: "Comment" },
            { id: "quote", label: "Quotation" },
          ] as { id: BookAction; label: string }[]).map(option => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: action === option.id }}
              key={option.id}
              onPress={() => setAction(option.id)}
              style={[styles.pill, action === option.id && { backgroundColor: theme.tint }]}
            >
              <Text style={action === option.id ? { color: theme.background } : undefined}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        {action === "review" ? (
          <>
            <Text secondary style={styles.label}>Rating, optional</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratings}>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: rating === undefined }} onPress={() => setRating(undefined)} style={[styles.rating, rating === undefined && { backgroundColor: theme.tint }]}>
                <Text style={rating === undefined ? { color: theme.background } : undefined}>No rating</Text>
              </Pressable>
              {RATINGS.map(value => (
                <Pressable accessibilityLabel={`${value} out of 5 stars`} accessibilityRole="radio" accessibilityState={{ checked: rating === value }} key={value} onPress={() => setRating(value)} style={[styles.rating, rating === value && { backgroundColor: theme.tint }]}>
                  <Text style={rating === value ? { color: theme.background } : undefined}>{value}★</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {action === "quote" ? (
          <>
            <Text secondary style={styles.label}>Quoted passage</Text>
            <TextInput
              accessibilityLabel="Quoted passage"
              maxLength={5000}
              multiline
              onChangeText={setQuote}
              placeholder="Enter the passage exactly as printed"
              style={styles.quoteInput}
              value={quote}
            />
          </>
        ) : null}

        {action !== "review" ? (
          <>
            <Text secondary style={styles.label}>Page, optional</Text>
            <TextInput
              accessibilityLabel="Book page number"
              keyboardType="number-pad"
              onChangeText={setPage}
              placeholder="Page number"
              style={styles.pageInput}
              value={page}
            />
          </>
        ) : null}

        <Text secondary style={styles.label}>
          {action === "review" ? "Review" : action === "comment" ? "Comment" : "Your note, optional"}
        </Text>
        <TextInput
          accessibilityLabel="Book activity text"
          maxLength={100000}
          multiline
          onChangeText={setContent}
          placeholder={action === "review" ? "What did you think?" : action === "comment" ? "What would you like to discuss?" : "Add context for the quotation"}
          style={styles.bodyInput}
          value={content}
        />

        <Text secondary style={styles.label}>Visibility</Text>
        <View style={styles.pills}>
          {([
            { id: "public", label: "Public" },
            { id: "unlisted", label: "Quiet public" },
            { id: "private", label: "Followers" },
          ] as { id: BookVisibility; label: string }[]).map(option => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: visibility === option.id }}
              key={option.id}
              onPress={() => setVisibility(option.id)}
              style={[styles.pill, visibility === option.id && { backgroundColor: theme.tint }]}
            >
              <Text style={visibility === option.id ? { color: theme.background } : undefined}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: spoilerEnabled }} onPress={() => setSpoilerEnabled(value => !value)} style={[styles.warningToggle, spoilerEnabled && { backgroundColor: theme.secondaryBackground }]}>
          <Icon color={theme.tint} name="warning-outline" size={20} />
          <Text>Content warning</Text>
        </Pressable>
        {spoilerEnabled ? (
          <TextInput accessibilityLabel="Content warning" maxLength={500} onChangeText={setSpoilerText} placeholder="Brief content warning" style={styles.warningInput} value={spoilerText} />
        ) : null}

        <Text secondary style={styles.notice}>
          Publishing creates federated reading activity. Moving a book between shelves in My books remains a quiet library change.
        </Text>
        <AppButton
          color={theme.tint}
          disabled={submitting || missingRequiredContent || (spoilerEnabled && !spoilerText.trim())}
          fullWidth
          onPress={() => { void submit(); }}
          title={submitting ? "Publishing..." : "Publish"}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 11, padding: 16 },
  book: { alignItems: "flex-start", borderRadius: 11, flexDirection: "row", gap: 12, padding: 12 },
  cover: { borderRadius: 6, height: 94, width: 65 },
  coverPlaceholder: { alignItems: "center", borderRadius: 6, height: 94, justifyContent: "center", width: 65 },
  bookIdentity: { flex: 1, gap: 3 },
  title: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: { borderRadius: 18, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  ratings: { gap: 7 },
  rating: { borderRadius: 18, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  quoteInput: { minHeight: 105, textAlignVertical: "top" },
  pageInput: { minHeight: 48 },
  bodyInput: { minHeight: 170, textAlignVertical: "top" },
  warningToggle: { alignItems: "center", alignSelf: "flex-start", borderRadius: 9, flexDirection: "row", gap: 7, minHeight: 48, paddingHorizontal: 12 },
  warningInput: { minHeight: 48 },
  notice: { fontSize: 13, lineHeight: 18 },
});

/* end of BookReviewScreen.tsx */
