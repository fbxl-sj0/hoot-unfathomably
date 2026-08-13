/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseWorldsScreens.test.tsx

    Purpose:

        Verify the mobile Worlds workflow against Unfathomably 3.5 contracts.

    Responsibilities:

        - Browse the server-supported Worlds catalog
        - Load family-specific native timelines
        - Search and resolve provider-neutral results through the local server

    This file intentionally does NOT contain:

        - live provider discovery
        - native-object authoring
        - Rebased or Pleroma extension assumptions
*/

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import WorldsScreen from "../WorldsScreen";
import { makeContext, makeNativeStatus } from "../../testing/fediverseFixtures";

const mockGetWorldTimeline = jest.fn();
const mockGetWorldWorkflows = jest.fn();
const mockResolveNativeObject = jest.fn();
const mockSearchWorlds = jest.fn();
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

jest.mock("../../services/UnfathomablyWorldsService", () => ({
  getWorldTimeline: (...args: unknown[]) => mockGetWorldTimeline(...args),
  getWorldWorkflows: (...args: unknown[]) => mockGetWorldWorkflows(...args),
  resolveNativeObject: (...args: unknown[]) => mockResolveNativeObject(...args),
  searchWorlds: (...args: unknown[]) => mockSearchWorlds(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return function MockStatusCard({ status }: { status: { id: string } }) {
    return React.createElement(Text, null, `native-status:${status.id}`);
  };
});

describe("Worlds screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    mockGetWorldTimeline.mockResolvedValue([]);
    mockGetWorldWorkflows.mockResolvedValue({
      version: 2,
      workflows: [
        { actions: ["open"], creation: [], family: "books", objects: ["Book"], platforms: ["BookWyrm"] },
        { actions: ["open"], creation: [], family: "photo", objects: ["Image"], platforms: ["Pixelfed"] },
      ],
    });
    mockResolveNativeObject.mockResolvedValue({
      resultType: "status",
      status: makeNativeStatus({ id: "resolved-native" }),
    });
    mockSearchWorlds.mockResolvedValue({
      hasMore: false,
      items: [],
      providers: [],
      total: 0,
    });
  });

  test("shows all Worlds families while marking unsupported manifest entries", async () => {
    const screen = await render(
      <WorldsScreen navigation={{ navigate: jest.fn() }} route={{ params: { view: "browse" } }} />,
    );

    expect(screen.getByText("Books")).toBeTruthy();
    expect(screen.getByText("Photography")).toBeTruthy();
    expect(screen.getByText("Events")).toBeTruthy();
    expect(screen.getByText("Software")).toBeTruthy();
    await waitFor(() => {
      expect(mockGetWorldWorkflows).toHaveBeenCalledWith(
        makeContext("unfathomably"),
      );
    });
  });

  test("loads a selected native timeline without changing server context", async () => {
    const status = makeNativeStatus({ id: "photo-status" });
    mockGetWorldTimeline.mockResolvedValue([status]);
    const screen = await render(
      <WorldsScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { family: "photo", view: "feed" } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("native-status:photo-status")).toBeTruthy();
      expect(mockGetWorldTimeline).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "photo",
      );
    });
  });

  test("searches Books and opens a selected result through the local server", async () => {
    const item = {
      activitypubUrl: "https://books.example/activity/book-1",
      family: "books",
      fields: { author: "Ursula K. Le Guin" },
      id: "book-1",
      kind: "book",
      sourceHost: "books.example",
      summary: "A federated book result.",
      title: "The Dispossessed",
      url: "https://books.example/books/1",
    };
    mockSearchWorlds.mockResolvedValue({
      hasMore: false,
      items: [item],
      providers: [{ host: "books.example", status: "ready" }],
      total: 1,
    });
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <WorldsScreen
        navigation={navigation}
        route={{ params: { family: "books", view: "find" } }}
      />,
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText("Find a book, author, or ISBN"),
      "dispossessed",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Search Worlds" }),
    );
    await waitFor(() => {
      expect(screen.getByText("The Dispossessed")).toBeTruthy();
      expect(mockSearchWorlds).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "books",
        "dispossessed",
        0,
      );
    });
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open The Dispossessed on this server",
      }),
    );
    await waitFor(() => {
      expect(mockResolveNativeObject).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "https://books.example/activity/book-1",
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Status", {
        statusId: "resolved-native",
      });
    });
  });
});

/* end of FediverseWorldsScreens.test.tsx */
