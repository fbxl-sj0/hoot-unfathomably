/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseBooksRoutesScreens.test.tsx

    Purpose:

        Verify the phone-facing Books and GPS Routes workflows.

    Responsibilities:

        - Keep shelf updates separate from federated book activity
        - Pass validated reading progress to the quiet library service
        - Request foreground location only after the user starts recording
        - Explain local GPS draft and publication privacy

    This file intentionally does NOT contain:

        - live server writes
        - real Android location fixes
        - GPX parser contract tests
*/

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import BookLibraryScreen from "../BookLibraryScreen";
import RouteRecorderScreen from "../RouteRecorderScreen";
import { makeContext } from "../../testing/fediverseFixtures";

const mockGetBookLibrary = jest.fn();
const mockSaveBookShelfEntry = jest.fn();
const mockRequestForegroundPermissions = jest.fn();
const mockWatchPosition = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    tertiaryBackground: "#ddd",
    text: "#111",
    tint: "#d87900",
  }),
}));

jest.mock("../../services/UnfathomablyBooksService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyBooksService");
  return {
    ...actual,
    getBookLibrary: (...args: unknown[]) => mockGetBookLibrary(...args),
    removeBookShelfEntry: jest.fn(),
    saveBookShelfEntry: (...args: unknown[]) => mockSaveBookShelfEntry(...args),
  };
});

jest.mock("expo-location", () => ({
  Accuracy: { BestForNavigation: 6 },
  hasServicesEnabledAsync: jest.fn(() => Promise.resolve(true)),
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForegroundPermissions(...args),
  watchPositionAsync: (...args: unknown[]) => mockWatchPosition(...args),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true })),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  shareAsync: jest.fn(),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { UTF8: "utf8" },
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock("expo-keep-awake", () => ({
  useKeepAwake: jest.fn(),
}));

jest.mock("../../components/RouteTrackPreview", () => {
  const ReactModule = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return function MockRouteTrackPreview() {
    return ReactModule.createElement(Text, null, "GPS track preview");
  };
});

describe("Books and Routes screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    mockGetBookLibrary.mockResolvedValue({
      shelves: [
        { id: "to-read", items: [], name: "Want to read" },
        { id: "reading", items: [], name: "Reading" },
        { id: "read", items: [], name: "Read" },
        { id: "stopped-reading", items: [], name: "Stopped" },
      ],
      total: 0,
    });
    mockSaveBookShelfEntry.mockResolvedValue({
      bookUri: "https://books.example/book/1",
      finishedAt: null,
      id: "entry-1",
      presentation: { author: "N. K. Jemisin", title: "The Fifth Season" },
      progress: 35,
      progressMode: "percent",
      shelf: "reading",
      startedAt: "2026-08-13T12:00:00.000Z",
      updatedAt: "2026-08-13T12:00:00.000Z",
    });
    mockRequestForegroundPermissions.mockResolvedValue({ status: "granted" });
    mockWatchPosition.mockResolvedValue({ remove: jest.fn() });
  });

  test("adds a discovered book to Reading with percentage progress", async () => {
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <BookLibraryScreen {...({
        navigation,
        route: {
          params: {
            book: {
              author: "N. K. Jemisin",
              bookUri: "https://books.example/book/1",
              title: "The Fifth Season",
            },
          },
        },
      } as any)} />,
    );

    await waitFor(() => expect(mockGetBookLibrary).toHaveBeenCalled());
    await fireEvent.press(screen.getByRole("radio", { name: "Reading" }));
    await fireEvent.changeText(screen.getByLabelText("Reading progress"), "35");
    await fireEvent.press(screen.getByRole("button", { name: "Add to my books" }));

    await waitFor(() => expect(mockSaveBookShelfEntry).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      {
        book: {
          author: "N. K. Jemisin",
          bookUri: "https://books.example/book/1",
          title: "The Fifth Season",
        },
        progress: 35,
        progressMode: "percent",
        shelf: "reading",
      },
    ));
    expect(navigation.navigate).not.toHaveBeenCalledWith("BookReview", expect.anything());
  });

  test("does not ask for location until Start recording is pressed", async () => {
    const screen = await render(
      <RouteRecorderScreen {...({
        navigation: { replace: jest.fn() },
        route: { params: undefined },
      } as any)} />,
    );

    expect(screen.getByText(/path stays private on this device/i)).toBeTruthy();
    expect(mockRequestForegroundPermissions).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Start recording" }));

    await waitFor(() => {
      expect(mockRequestForegroundPermissions).toHaveBeenCalledTimes(1);
      expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    });
  });
});

/* end of FediverseBooksRoutesScreens.test.tsx */
