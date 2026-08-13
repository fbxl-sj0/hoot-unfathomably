/*
    Project: Hoot Unfathomably
    --------------------------

    File: BookLibraryScreen.tsx

    Purpose:

        Let a signed-in reader manage their Unfathomably book library.

    Responsibilities:

        - Browse and search the four reading shelves
        - Add or move a selected book without creating a timeline post
        - Track reading progress in pages or percent
        - Route explicit reviews into the native book composer

    This file intentionally does NOT contain:

        - BookWyrm discovery requests
        - ActivityPub serialization
        - public account-library presentation
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import AppButton from "../components/AppButton";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  BookLibrary,
  BookProgressMode,
  BookReference,
  BookShelfEntry,
  BookShelfId,
  BOOK_SHELF_IDS,
  getBookLibrary,
  removeBookShelfEntry,
  saveBookShelfEntry,
  shelfName,
} from "../services/UnfathomablyBooksService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";

type ShelfFilter = BookShelfId | "all";

/* ------------------------------------------------------------------------- */
/* Library update helpers                                                    */
/* ------------------------------------------------------------------------- */

function replaceLibraryEntry(
  library: BookLibrary,
  entry: BookShelfEntry,
): BookLibrary {
  const shelves = library.shelves.map(shelf => {
    const remaining = shelf.items.filter(item => item.bookUri !== entry.bookUri);
    return shelf.id === entry.shelf
      ? { ...shelf, items: [entry, ...remaining] }
      : { ...shelf, items: remaining };
  });

  return {
    shelves,
    total: shelves.reduce((count, shelf) => count + shelf.items.length, 0),
  };
}

function removeLibraryEntry(library: BookLibrary, bookUri: string): BookLibrary {
  const shelves = library.shelves.map(shelf => ({
    ...shelf,
    items: shelf.items.filter(item => item.bookUri !== bookUri),
  }));
  return {
    shelves,
    total: shelves.reduce((count, shelf) => count + shelf.items.length, 0),
  };
}

function referenceFromEntry(entry: BookShelfEntry): BookReference {
  return { bookUri: entry.bookUri, ...entry.presentation };
}

function readableDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------------- */
/* Screen                                                                    */
/* ------------------------------------------------------------------------- */

export default function BookLibraryScreen({
  navigation,
  route,
}: RootStackScreenProps<"BookLibrary">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [library, setLibrary] = useState<BookLibrary>();
  const [selectedBook, setSelectedBook] = useState<BookReference | undefined>(route.params?.book);
  const [shelfFilter, setShelfFilter] = useState<ShelfFilter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ctx?.login) return;
    setLoading(true);
    setError("");
    /* Never leave another saved account's shelves visible during a switch. */
    setLibrary(undefined);
    try {
      setLibrary(await getBookLibrary(ctx as LotideContext));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!route.params?.book) return;
    const timer = setTimeout(() => setSelectedBook(route.params?.book), 0);
    return () => clearTimeout(timer);
  }, [route.params?.book]);

  const entries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (library?.shelves || [])
      .filter(shelf => shelfFilter === "all" || shelf.id === shelfFilter)
      .flatMap(shelf => shelf.items)
      .filter(entry => {
        if (!normalizedQuery) return true;
        return [
          entry.presentation.title,
          entry.presentation.subtitle,
          entry.presentation.author,
          entry.presentation.isbn,
          entry.bookUri,
        ].some(value => value?.toLocaleLowerCase().includes(normalizedQuery));
      });
  }, [library, query, shelfFilter]);

  const currentEntry = useMemo(() =>
    selectedBook
      ? library?.shelves.flatMap(shelf => shelf.items)
        .find(entry => entry.bookUri === selectedBook.bookUri)
      : undefined,
  [library, selectedBook]);

  if (!ctx?.login) return <SuggestLogin />;

  async function save(
    shelf: BookShelfId,
    progress: number | null,
    progressMode: BookProgressMode | null,
  ) {
    if (!selectedBook || saving) return;
    setSaving(true);
    try {
      const entry = await saveBookShelfEntry(ctx as LotideContext, {
        book: selectedBook,
        progress,
        progressMode,
        shelf,
      });
      setLibrary(existing => existing ? replaceLibraryEntry(existing, entry) : existing);
    } catch (reason) {
      Alert.alert("Could not save reading state", getErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove() {
    if (!selectedBook || !currentEntry || saving) return;
    Alert.alert(
      "Remove from your books?",
      "This quietly removes the shelf entry. It does not delete reviews or other posts.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Remove",
          onPress: () => {
            setSaving(true);
            void removeBookShelfEntry(ctx as LotideContext, selectedBook.bookUri)
              .then(() => {
                setLibrary(existing => existing
                  ? removeLibraryEntry(existing, selectedBook.bookUri)
                  : existing);
              })
              .catch(reason => {
                Alert.alert("Could not remove book", getErrorMessage(reason));
              })
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.heading}>My books</Text>
          <Text secondary>{library ? `${library.total} total` : "Your reading library"}</Text>
        </View>
        <Pressable
          accessibilityLabel="Find books"
          accessibilityRole="button"
          onPress={() => navigation.navigate("Worlds", { family: "books", view: "find" })}
          style={[styles.findButton, { backgroundColor: theme.tint }]}
        >
          <Icon color={theme.onTint} name="search-outline" size={21} />
          <Text style={{ color: theme.onTint }}>Find books</Text>
        </Pressable>
      </View>

      {selectedBook ? (
        <BookEditor
          book={selectedBook}
          current={currentEntry}
          disabled={saving}
          key={`${selectedBook.bookUri}:${currentEntry?.updatedAt || "new"}`}
          onClose={() => setSelectedBook(undefined)}
          onRemove={confirmRemove}
          onReview={() => navigation.navigate("BookReview", { book: selectedBook })}
          onSave={(shelf, progress, progressMode) => {
            void save(shelf, progress, progressMode);
          }}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={styles.shelfFilters}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {(["all", ...BOOK_SHELF_IDS] as ShelfFilter[]).map(shelf => {
          const count = shelf === "all"
            ? library?.total || 0
            : library?.shelves.find(item => item.id === shelf)?.items.length || 0;
          const selected = shelfFilter === shelf;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={shelf}
              onPress={() => setShelfFilter(shelf)}
              style={[styles.shelfPill, selected && { backgroundColor: theme.tint }]}
            >
              <Text style={selected ? { color: theme.onTint } : undefined}>
                {shelf === "all" ? "All" : shelfName(shelf)} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextInput
        accessibilityLabel="Search your book library"
        onChangeText={setQuery}
        placeholder="Search title, author, or ISBN"
        returnKeyType="search"
        style={styles.search}
        value={query}
      />
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={entries}
        keyExtractor={entry => entry.id}
        ListHeaderComponent={header}
        ListEmptyComponent={error
          ? <RetryState message={error} onRetry={() => { void load(); }} />
          : loading
            ? <Text secondary style={styles.empty}>Loading your library...</Text>
            : <Text secondary style={styles.empty}>
                {library?.total
                  ? "No books match this shelf and search."
                  : "Your shelves are empty. Find a book, then add it here."}
              </Text>}
        onRefresh={() => { void load(); }}
        refreshing={loading}
        renderItem={({ item }) => (
          <BookRow
            entry={item}
            onPress={() => setSelectedBook(referenceFromEntry(item))}
          />
        )}
      />
    </View>
  );
}

/* ------------------------------------------------------------------------- */
/* Book editor                                                               */
/* ------------------------------------------------------------------------- */

function BookEditor({
  book,
  current,
  disabled,
  onClose,
  onRemove,
  onReview,
  onSave,
}: {
  book: BookReference;
  current?: BookShelfEntry;
  disabled: boolean;
  onClose: () => void;
  onRemove: () => void;
  onReview: () => void;
  onSave: (shelf: BookShelfId, progress: number | null, mode: BookProgressMode | null) => void;
}) {
  const theme = useTheme();
  const [shelf, setShelf] = useState<BookShelfId>(current?.shelf || "to-read");
  const [progress, setProgress] = useState(current?.progress === null || current?.progress === undefined
    ? ""
    : String(current.progress));
  const [progressMode, setProgressMode] = useState<BookProgressMode>(current?.progressMode || "percent");

  function submit() {
    const numericProgress = progress.trim() ? Number(progress) : null;
    if (
      numericProgress !== null &&
      (!Number.isInteger(numericProgress) || numericProgress < 0 ||
        (progressMode === "percent" && numericProgress > 100))
    ) {
      Alert.alert(
        "Invalid progress",
        progressMode === "percent"
          ? "Enter a whole percentage from 0 to 100."
          : "Enter a whole page number of 0 or greater.",
      );
      return;
    }
    onSave(shelf, shelf === "reading" ? numericProgress : null, shelf === "reading" && numericProgress !== null ? progressMode : null);
  }

  return (
    <View
      style={[
        styles.editor,
        { backgroundColor: theme.secondaryBackground, borderColor: theme.tertiaryBackground },
      ]}
    >
      <View style={[styles.editorTitleRow, { backgroundColor: theme.secondaryBackground }]}>
        {book.image ? <Image source={{ uri: book.image }} style={styles.editorCover} /> : null}
        <View style={[styles.editorIdentity, { backgroundColor: theme.secondaryBackground }]}>
          <Text style={styles.editorTitle}>{book.title || "Selected book"}</Text>
          {book.author ? <Text secondary>by {book.author}</Text> : null}
          {book.isbn ? <Text secondary>ISBN {book.isbn}</Text> : null}
        </View>
        <Pressable accessibilityLabel="Close book editor" accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Icon color={theme.secondaryText} name="close-outline" size={25} />
        </Pressable>
      </View>

      <Text secondary style={styles.label}>Reading shelf</Text>
      <View style={[styles.editorPills, { backgroundColor: theme.secondaryBackground }]}>
        {BOOK_SHELF_IDS.map(shelfId => {
          const selected = shelf === shelfId;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={shelfId}
              onPress={() => setShelf(shelfId)}
              style={[styles.editorPill, selected && { backgroundColor: theme.tint }]}
            >
              <Text style={selected ? { color: theme.onTint } : undefined}>{shelfName(shelfId)}</Text>
            </Pressable>
          );
        })}
      </View>

      {shelf === "reading" ? (
        <View style={[styles.progressRow, { backgroundColor: theme.secondaryBackground }]}>
          <TextInput
            accessibilityLabel="Reading progress"
            keyboardType="number-pad"
            onChangeText={setProgress}
            placeholder={progressMode === "percent" ? "0 to 100" : "Page"}
            style={styles.progressInput}
            value={progress}
          />
          {(["percent", "page"] as BookProgressMode[]).map(mode => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: progressMode === mode }}
              key={mode}
              onPress={() => setProgressMode(mode)}
              style={[styles.progressMode, progressMode === mode && { backgroundColor: theme.tint }]}
            >
              <Text style={progressMode === mode ? { color: theme.onTint } : undefined}>
                {mode === "percent" ? "Percent" : "Pages"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.editorActions, { backgroundColor: theme.secondaryBackground }]}>
        <AppButton
          color={theme.tint}
          disabled={disabled}
          onPress={submit}
          title={disabled ? "Saving..." : current ? "Save changes" : "Add to my books"}
        />
        <Pressable accessibilityLabel="Write a book review" accessibilityRole="button" onPress={onReview} style={styles.textAction}>
          <Icon color={theme.tint} name="create-outline" size={20} />
          <Text tint>Review</Text>
        </Pressable>
        {current ? (
          <Pressable accessibilityLabel="Remove from my books" accessibilityRole="button" disabled={disabled} onPress={onRemove} style={styles.textAction}>
            <Icon color="#b43b3b" name="trash-outline" size={20} />
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------- */
/* Library row                                                               */
/* ------------------------------------------------------------------------- */

function BookRow({ entry, onPress }: { entry: BookShelfEntry; onPress: () => void }) {
  const theme = useTheme();
  const started = readableDate(entry.startedAt);
  const finished = readableDate(entry.finishedAt);
  return (
    <Pressable
      accessibilityLabel={`Manage ${entry.presentation.title || "book"}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.bookRow, { borderColor: theme.tertiaryBackground }]}
    >
      {entry.presentation.image ? (
        <Image source={{ uri: entry.presentation.image }} style={styles.cover} />
      ) : (
        <View style={[styles.coverPlaceholder, { backgroundColor: theme.secondaryBackground }]}>
          <Icon color={theme.tint} name="book-outline" size={30} />
        </View>
      )}
      <View style={styles.bookBody}>
        <Text numberOfLines={2} style={styles.bookTitle}>{entry.presentation.title || entry.bookUri}</Text>
        {entry.presentation.subtitle ? <Text secondary numberOfLines={1}>{entry.presentation.subtitle}</Text> : null}
        {entry.presentation.author ? <Text numberOfLines={1}>by {entry.presentation.author}</Text> : null}
        <Text tint style={styles.shelfLabel}>{shelfName(entry.shelf)}</Text>
        {entry.progress !== null ? (
          <Text secondary>
            {entry.progress}{entry.progressMode === "percent" ? "%" : ` page${entry.progress === 1 ? "" : "s"}`}
          </Text>
        ) : null}
        {started || finished ? (
          <Text secondary style={styles.dates}>
            {[started ? `Started ${started}` : "", finished ? `Finished ${finished}` : ""].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      <Icon color={theme.secondaryText} name="chevron-forward-outline" size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: 13, padding: 15 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  headingText: { flex: 1 },
  heading: { fontSize: 24, fontWeight: "700" },
  findButton: { alignItems: "center", borderRadius: 9, flexDirection: "row", gap: 7, minHeight: 48, paddingHorizontal: 13 },
  shelfFilters: { gap: 7 },
  shelfPill: { borderRadius: 19, justifyContent: "center", minHeight: 44, paddingHorizontal: 13 },
  search: { minHeight: 48 },
  empty: { padding: 30, textAlign: "center" },
  editor: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 12 },
  editorTitleRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  editorCover: { borderRadius: 6, height: 78, width: 54 },
  editorIdentity: { flex: 1, gap: 2 },
  editorTitle: { fontSize: 18, fontWeight: "700" },
  close: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  editorPills: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  editorPill: { borderRadius: 17, justifyContent: "center", minHeight: 44, paddingHorizontal: 11 },
  progressRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 7 },
  progressInput: { flexGrow: 1, minHeight: 48, minWidth: 100 },
  progressMode: { borderRadius: 9, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  editorActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  textAction: { alignItems: "center", flexDirection: "row", gap: 5, minHeight: 48, paddingHorizontal: 6 },
  removeText: { color: "#b43b3b" },
  bookRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 12, minHeight: 132, padding: 15 },
  cover: { borderRadius: 7, height: 104, width: 72 },
  coverPlaceholder: { alignItems: "center", borderRadius: 7, height: 104, justifyContent: "center", width: 72 },
  bookBody: { flex: 1, gap: 3 },
  bookTitle: { fontSize: 17, fontWeight: "700" },
  shelfLabel: { fontSize: 12, fontWeight: "800", marginTop: 3, textTransform: "uppercase" },
  dates: { fontSize: 12 },
});

/* end of BookLibraryScreen.tsx */
