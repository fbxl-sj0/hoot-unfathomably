/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyBooksService.ts

    Purpose:

        Provide the mobile boundary for Unfathomably reading libraries.

    Responsibilities:

        - Validate and normalize book shelf responses
        - Add, move, and remove books through the authenticated shelf API
        - Publish bounded BookWyrm-shaped reviews and reading comments
        - Keep older Rebased and Pleroma failures explicit and recoverable

    This file intentionally does NOT contain:

        - React state or presentation code
        - direct BookWyrm or catalog-provider requests
        - guesses about whether an arbitrary URL is federatable
*/

import {
  request,
  UnfathomablyStatus,
} from "./UnfathomablyService";

const MAX_LIBRARY_ENTRIES = 5_000;
const MAX_PRESENTATION_TEXT_LENGTH = 2_048;
const UNAVAILABLE_STATUSES = new Set([404, 405, 410, 501]);

export const BOOK_SHELF_IDS = [
  "to-read",
  "reading",
  "read",
  "stopped-reading",
] as const;

export type BookShelfId = typeof BOOK_SHELF_IDS[number];
export type BookProgressMode = "page" | "percent";

export type BookPresentation = {
  author?: string;
  image?: string;
  isbn?: string;
  publishedAt?: string;
  subtitle?: string;
  title?: string;
};

export type BookReference = BookPresentation & {
  bookUri: string;
};

export type BookShelfEntry = {
  id: string;
  bookUri: string;
  shelf: BookShelfId;
  progress: number | null;
  progressMode: BookProgressMode | null;
  presentation: BookPresentation;
  collectionUrl?: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type BookShelf = {
  id: BookShelfId;
  name: string;
  items: BookShelfEntry[];
};

export type BookLibrary = {
  shelves: BookShelf[];
  total: number;
};

export type SaveBookShelfInput = {
  book: BookReference;
  progress?: number | null;
  progressMode?: BookProgressMode | null;
  shelf: BookShelfId;
};

export type CreateBookActivityInput = {
  action: "comment" | "quote" | "review";
  book: BookReference;
  content: string;
  page?: number;
  quote?: string;
  rating?: number;
  spoilerText?: string;
  visibility?: "private" | "public" | "unlisted";
};

/* ------------------------------------------------------------------------- */
/* Response validation                                                       */
/* ------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum = MAX_PRESENTATION_TEXT_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maximum) : undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  const text = boundedText(value);
  if (!text) return undefined;

  try {
    const url = new URL(text);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isShelfId(value: unknown): value is BookShelfId {
  return BOOK_SHELF_IDS.includes(value as BookShelfId);
}

function isProgressMode(value: unknown): value is BookProgressMode {
  return value === "page" || value === "percent";
}

function normalizedDate(value: unknown, required: boolean): string | null | undefined {
  if (value === null && !required) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return required ? undefined : null;
  }
  return value;
}

function normalizePresentation(value: unknown): BookPresentation {
  if (!isRecord(value)) return {};

  return {
    author: boundedText(value.author),
    image: safeHttpUrl(value.image),
    isbn: boundedText(value.isbn, 40),
    publishedAt: boundedText(value.published_at, 80),
    subtitle: boundedText(value.subtitle, 500),
    title: boundedText(value.title, 500),
  };
}

function normalizeEntry(value: unknown): BookShelfEntry | undefined {
  if (!isRecord(value)) return undefined;

  const id = boundedText(value.id, 255);
  const bookUri = safeHttpUrl(value.book_uri);
  const shelf = value.shelf;
  const updatedAt = normalizedDate(value.updated_at, true);
  const progress = value.progress === null
    ? null
    : typeof value.progress === "number" &&
        Number.isInteger(value.progress) &&
        value.progress >= 0
      ? value.progress
      : undefined;
  const progressMode = value.progress_mode === null
    ? null
    : isProgressMode(value.progress_mode)
      ? value.progress_mode
      : undefined;

  if (
    !id ||
    !bookUri ||
    !isShelfId(shelf) ||
    !updatedAt ||
    progress === undefined ||
    progressMode === undefined ||
    (progress !== null && progressMode === null) ||
    (progressMode === "percent" && progress !== null && progress > 100)
  ) {
    return undefined;
  }

  return {
    id,
    bookUri,
    shelf,
    progress,
    progressMode,
    presentation: normalizePresentation(value.presentation),
    collectionUrl: safeHttpUrl(value.collection_url),
    startedAt: normalizedDate(value.started_at, false) ?? null,
    finishedAt: normalizedDate(value.finished_at, false) ?? null,
    updatedAt,
  };
}

function normalizeLibrary(value: unknown): BookLibrary {
  if (!isRecord(value) || !Array.isArray(value.shelves)) {
    throw new Error("The server returned an invalid book library.");
  }

  let remainingEntries = MAX_LIBRARY_ENTRIES;
  const shelves = value.shelves.flatMap(shelfValue => {
    if (!isRecord(shelfValue) || !isShelfId(shelfValue.id)) return [];
    const items = Array.isArray(shelfValue.items)
      ? shelfValue.items.slice(0, remainingEntries).flatMap(entryValue => {
          const entry = normalizeEntry(entryValue);
          return entry ? [entry] : [];
        })
      : [];
    remainingEntries -= items.length;

    return [{
      id: shelfValue.id,
      name: boundedText(shelfValue.name, 100) || shelfName(shelfValue.id),
      items,
    }];
  });

  const orderedShelves = BOOK_SHELF_IDS.map(id =>
    shelves.find(shelf => shelf.id === id) || {
      id,
      name: shelfName(id),
      items: [],
    },
  );
  const total = orderedShelves.reduce((count, shelf) => count + shelf.items.length, 0);

  return { shelves: orderedShelves, total };
}

function normalizeSavedEntry(value: unknown): BookShelfEntry {
  const entry = normalizeEntry(value);
  if (!entry) throw new Error("The server returned an invalid shelf entry.");
  return entry;
}

function rethrowBooksUnavailable(error: unknown): never {
  const status = (error as Error & { status?: number })?.status;
  if (status && UNAVAILABLE_STATUSES.has(status)) {
    throw new Error("Book libraries are not available on this server.");
  }
  throw error;
}

/* ------------------------------------------------------------------------- */
/* Public helpers                                                            */
/* ------------------------------------------------------------------------- */

export function shelfName(shelf: BookShelfId): string {
  switch (shelf) {
    case "to-read":
      return "Want to read";
    case "reading":
      return "Reading";
    case "read":
      return "Read";
    case "stopped-reading":
      return "Stopped";
  }
}

export function bookReferenceFromFields(
  bookUri: string,
  title: string,
  fields: Record<string, unknown>,
  image?: string,
): BookReference {
  const supportedBookUri = safeHttpUrl(bookUri);
  if (!supportedBookUri) {
    throw new Error("The book does not have a safe canonical address.");
  }

  return {
    bookUri: supportedBookUri,
    author: boundedText(fields.author) || boundedText(fields.creator),
    image: safeHttpUrl(image) || safeHttpUrl(fields.image) || safeHttpUrl(fields.cover),
    isbn:
      boundedText(fields.isbn, 40) ||
      boundedText(fields.isbn13, 40) ||
      boundedText(fields.isbn10, 40),
    publishedAt:
      boundedText(fields.published_at, 80) ||
      boundedText(fields.publishedDate, 80),
    subtitle: boundedText(fields.subtitle, 500),
    title: boundedText(title, 500),
  };
}

/* ------------------------------------------------------------------------- */
/* Reading-library requests                                                  */
/* ------------------------------------------------------------------------- */

export async function getBookLibrary(
  ctx: LotideContext,
  accountId?: string,
): Promise<BookLibrary> {
  const path = accountId
    ? `/api/v1/accounts/${encodeURIComponent(accountId)}/book_shelves`
    : "/api/v1/book_shelves";

  try {
    return normalizeLibrary(await request<unknown>(ctx, path));
  } catch (error) {
    rethrowBooksUnavailable(error);
  }
}

export async function saveBookShelfEntry(
  ctx: LotideContext,
  input: SaveBookShelfInput,
): Promise<BookShelfEntry> {
  const bookUri = safeHttpUrl(input.book.bookUri);
  if (!bookUri) throw new Error("Choose a book with a complete HTTP or HTTPS address.");
  if (!isShelfId(input.shelf)) throw new Error("Choose a supported reading shelf.");

  const progress = input.progress === null || input.progress === undefined
    ? null
    : Number.isInteger(input.progress) && input.progress >= 0
      ? input.progress
      : undefined;
  if (progress === undefined) throw new Error("Reading progress must be a whole positive number.");
  if (progress !== null && !isProgressMode(input.progressMode)) {
    throw new Error("Choose pages or percent for reading progress.");
  }
  if (input.progressMode === "percent" && progress !== null && progress > 100) {
    throw new Error("Percentage progress cannot be greater than 100.");
  }

  const presentation = {
    author: boundedText(input.book.author),
    image: safeHttpUrl(input.book.image),
    isbn: boundedText(input.book.isbn, 40),
    published_at: boundedText(input.book.publishedAt, 80),
    subtitle: boundedText(input.book.subtitle, 500),
    title: boundedText(input.book.title, 500),
  };

  try {
    return normalizeSavedEntry(await request<unknown>(ctx, "/api/v1/book_shelves", {
      method: "POST",
      body: JSON.stringify({
        book_uri: bookUri,
        presentation,
        progress,
        progress_mode: progress === null ? null : input.progressMode,
        shelf: input.shelf,
      }),
    }));
  } catch (error) {
    rethrowBooksUnavailable(error);
  }
}

export async function removeBookShelfEntry(
  ctx: LotideContext,
  bookUri: string,
): Promise<void> {
  const supportedBookUri = safeHttpUrl(bookUri);
  if (!supportedBookUri) throw new Error("The book address is invalid.");

  try {
    await request<unknown>(
      ctx,
      `/api/v1/book_shelves?book_uri=${encodeURIComponent(supportedBookUri)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    rethrowBooksUnavailable(error);
  }
}

/* ------------------------------------------------------------------------- */
/* Publishable book activity                                                 */
/* ------------------------------------------------------------------------- */

export async function createBookActivity(
  ctx: LotideContext,
  input: CreateBookActivityInput,
): Promise<UnfathomablyStatus> {
  const bookUri = safeHttpUrl(input.book.bookUri);
  const title = boundedText(input.book.title, 200);
  const content = boundedText(input.content, 100_000);
  const quote = boundedText(input.quote, 5_000);
  if (!bookUri || !title) throw new Error("Choose a federated book before publishing.");
  if (!content && input.action === "review" && input.rating === undefined) {
    throw new Error("Write a review or choose a rating.");
  }
  if (input.action === "comment" && !content) throw new Error("Write a comment about the book.");
  if (input.action === "quote" && !quote) throw new Error("Enter the passage you are quoting.");
  if (
    input.rating !== undefined &&
    (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5 || input.rating * 2 % 1 !== 0)
  ) {
    throw new Error("Ratings must use half-star steps from 1 to 5.");
  }
  if (input.page !== undefined && (!Number.isInteger(input.page) || input.page < 1 || input.page > 1_000_000)) {
    throw new Error("Page numbers must be between 1 and 1,000,000.");
  }

  const fallbackContent = input.action === "review" && input.rating !== undefined
    ? `Rated ${title} ${input.rating} out of 5.`
    : input.action === "quote"
      ? `Quoted from ${title}.`
      : "";
  const fields: Record<string, string | number> = {
    book_action: input.action,
  };
  if (input.book.author) fields.author = input.book.author.slice(0, 160);
  if (input.book.isbn) fields.isbn = input.book.isbn.slice(0, 40);
  if (input.page !== undefined && input.action !== "review") fields.page = input.page;
  if (quote && input.action === "quote") fields.quote = quote;
  if (input.rating !== undefined && input.action === "review") fields.rating = input.rating;

  try {
    return await request<UnfathomablyStatus>(ctx, "/api/v1/discovery/native-objects", {
      method: "POST",
      body: JSON.stringify({
        template: "books",
        title,
        content: content || fallbackContent,
        fields,
        media_ids: [],
        reference_url: bookUri,
        spoiler_text: boundedText(input.spoilerText, 500),
        visibility: input.visibility || "public",
      }),
    });
  } catch (error) {
    rethrowBooksUnavailable(error);
  }
}

/* end of UnfathomablyBooksService.ts */
