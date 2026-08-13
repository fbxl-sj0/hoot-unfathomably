/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyBooksService.test.ts

    Purpose:

        Protect the mobile reading-library and book-activity contracts.

    Responsibilities:

        - Verify bounded shelf response normalization
        - Verify quiet shelf mutations use the dedicated library endpoint
        - Verify reviews use the explicit native-object publication endpoint
        - Verify older Rebased and Pleroma servers fail cleanly

    This file intentionally does NOT contain:

        - live server requests
        - React screen rendering
        - direct BookWyrm requests
*/

import {
  createBookActivity,
  getBookLibrary,
  removeBookShelfEntry,
  saveBookShelfEntry,
} from "../UnfathomablyBooksService";
import {
  FEDIVERSE_SERVERS,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const book = {
  author: "Ursula K. Le Guin",
  bookUri: "https://books.example/book/left-hand-of-darkness",
  image: "https://books.example/covers/left-hand.jpg",
  title: "The Left Hand of Darkness",
};

function shelfEntry(overrides: Record<string, unknown> = {}) {
  return {
    book_uri: book.bookUri,
    collection_url: "https://unfathomably.example/users/alice/books/reading",
    finished_at: null,
    id: "shelf-entry-1",
    presentation: {
      author: book.author,
      image: book.image,
      title: book.title,
    },
    progress: 42,
    progress_mode: "percent",
    shelf: "reading",
    started_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

describe("UnfathomablyBooksService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("normalizes the library and supplies omitted standard shelves", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        shelves: [
          { id: "reading", items: [shelfEntry()], name: "Reading now" },
          { id: "unknown", items: [shelfEntry()], name: "Ignore me" },
        ],
      }),
    });

    await expect(getBookLibrary(makeContext())).resolves.toMatchObject({
      shelves: [
        { id: "to-read", items: [] },
        { id: "reading", items: [{ bookUri: book.bookUri, progress: 42 }] },
        { id: "read", items: [] },
        { id: "stopped-reading", items: [] },
      ],
      total: 1,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/book_shelves`,
      expect.any(Object),
    );
  });

  test("saves shelf progress without creating a timeline post", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => shelfEntry(),
    });

    await saveBookShelfEntry(makeContext(), {
      book,
      progress: 42,
      progressMode: "percent",
      shelf: "reading",
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/book_shelves`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      book_uri: book.bookUri,
      presentation: {
        author: book.author,
        image: book.image,
        isbn: undefined,
        published_at: undefined,
        subtitle: undefined,
        title: book.title,
      },
      progress: 42,
      progress_mode: "percent",
      shelf: "reading",
    });
  });

  test("removes a shelf entry through its canonical book address", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await removeBookShelfEntry(makeContext(), book.bookUri);

    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/book_shelves?book_uri=${encodeURIComponent(book.bookUri)}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  test("publishes a review only after an explicit book-activity action", async () => {
    const status = makeStatus("unfathomably", { id: "book-review-1" });
    mockFetch.mockResolvedValue({ ok: true, json: async () => status });

    await expect(createBookActivity(makeContext(), {
      action: "review",
      book,
      content: "A thoughtful winter journey.",
      rating: 4.5,
      visibility: "unlisted",
    })).resolves.toEqual(status);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/discovery/native-objects`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      content: "A thoughtful winter journey.",
      fields: {
        author: book.author,
        book_action: "review",
        rating: 4.5,
      },
      reference_url: book.bookUri,
      template: "books",
      title: book.title,
      visibility: "unlisted",
    });
  });

  test("rejects invalid progress before contacting a server", async () => {
    await expect(saveBookShelfEntry(makeContext(), {
      book,
      progress: 101,
      progressMode: "percent",
      shelf: "reading",
    })).rejects.toThrow("cannot be greater than 100");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test.each(["rebased", "pleroma"] as const)(
    "degrades cleanly when %s has no book-library extension",
    async family => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      await expect(getBookLibrary(makeContext(family))).rejects.toThrow(
        "Book libraries are not available on this server.",
      );
    },
  );
});

/* end of UnfathomablyBooksService.test.ts */
