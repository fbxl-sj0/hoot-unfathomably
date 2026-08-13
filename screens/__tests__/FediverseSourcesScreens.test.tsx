/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseSourcesScreens.test.tsx

    Purpose:

        Verify the first-class mobile feeds and sources workflow.

    Responsibilities:

        - Load the aggregate followed-sources timeline
        - List and search source identities through the selected server
        - Preview source items and apply explicit follow changes

    This file intentionally does NOT contain:

        - live feed requests
        - RSS parsing
        - provider-specific embeds
*/

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import UnfathomablySourceScreen from "../UnfathomablySourceScreen";
import UnfathomablySourcesScreen from "../UnfathomablySourcesScreen";
import { makeContext, makeStatus } from "../../testing/fediverseFixtures";

const mockGetSource = jest.fn();
const mockGetSourceItems = jest.fn();
const mockGetSources = jest.fn();
const mockGetSourcesTimeline = jest.fn();
const mockSearchSources = jest.fn();
const mockSetSourceFollowed = jest.fn();
let mockCurrentContext: LotideContext | undefined;

function sourceFixture(following = true) {
  return {
    acct: "release-notes@feeds.example",
    actor_type: "Service",
    ap_id: "https://feeds.example/source/release-notes",
    avatar: "https://feeds.example/icon.png",
    capabilities: ["follow", "preview"],
    display_name: "Release notes",
    domain: "feeds.example",
    header: "https://feeds.example/header.png",
    id: "source-1",
    note: "Project release feeds.",
    platform: "rss",
    platform_family: "feed",
    platform_label: "RSS",
    relationship: { following, id: "source-1" },
    source_kind: "rss_feed",
    source_kind_label: "RSS feed",
    uri: "https://feeds.example/source/release-notes",
    url: "https://feeds.example/releases.xml",
    username: "release-notes",
  };
}

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

jest.mock("../../services/UnfathomablySourcesService", () => ({
  getSource: (...args: unknown[]) => mockGetSource(...args),
  getSourceItems: (...args: unknown[]) => mockGetSourceItems(...args),
  getSources: (...args: unknown[]) => mockGetSources(...args),
  getSourcesTimeline: (...args: unknown[]) => mockGetSourcesTimeline(...args),
  searchSources: (...args: unknown[]) => mockSearchSources(...args),
  setSourceFollowed: (...args: unknown[]) => mockSetSourceFollowed(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return function MockStatusCard({ status }: { status: { id: string } }) {
    return React.createElement(Text, null, `source-status:${status.id}`);
  };
});

describe("feeds and sources screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    mockGetSource.mockResolvedValue(sourceFixture());
    mockGetSourceItems.mockResolvedValue({ items: [] });
    mockGetSources.mockResolvedValue([]);
    mockGetSourcesTimeline.mockResolvedValue([]);
    mockSearchSources.mockResolvedValue([]);
    mockSetSourceFollowed.mockResolvedValue({ following: true, id: "source-1" });
  });

  test("loads the aggregate feeds timeline on the selected server", async () => {
    const status = makeStatus("unfathomably", { id: "feed-status" });
    mockGetSourcesTimeline.mockResolvedValue([status]);
    const screen = await render(
      <UnfathomablySourcesScreen navigation={{ navigate: jest.fn() }} />,
    );

    await waitFor(() => {
      expect(screen.getByText("source-status:feed-status")).toBeTruthy();
      expect(mockGetSourcesTimeline).toHaveBeenCalledWith(
        makeContext("unfathomably"),
      );
    });
  });

  test("lists followed feeds and changes the returned relationship", async () => {
    const source = sourceFixture();
    mockGetSources.mockResolvedValue([source]);
    mockSetSourceFollowed.mockResolvedValue({ following: false, id: source.id });
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <UnfathomablySourcesScreen navigation={navigation} />,
    );

    await fireEvent.press(screen.getByRole("tab", { name: "Following" }));
    await waitFor(() => {
      expect(screen.getByText("Release notes")).toBeTruthy();
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Unfollow Release notes" }),
    );
    await waitFor(() => {
      expect(mockSetSourceFollowed).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        source.id,
        false,
      );
      expect(
        screen.getByRole("button", { name: "Follow Release notes" }),
      ).toBeTruthy();
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Preview Release notes" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Source", {
      sourceId: source.id,
      title: source.display_name,
    });
  });

  test("searches for feeds only after an explicit request", async () => {
    mockSearchSources.mockResolvedValue([sourceFixture(false)]);
    const screen = await render(
      <UnfathomablySourcesScreen navigation={{ navigate: jest.fn() }} />,
    );

    await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Find a feed, publication, or creator"),
      "release",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Search feeds" }));
    await waitFor(() => {
      expect(mockSearchSources).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "release",
        0,
      );
      expect(screen.getByText("Release notes")).toBeTruthy();
    });
  });

  test("previews local statuses and non-status source items", async () => {
    const source = sourceFixture();
    const status = makeStatus("unfathomably", { id: "source-wrapped-status" });
    mockGetSource.mockResolvedValue(source);
    mockGetSourceItems.mockResolvedValue({
      items: [
        { id: "status-item", platform: "rss", platformLabel: "RSS", sourceKind: "rss_feed", sourceKindLabel: "RSS feed", status, title: "Status item", type: "Article", capabilities: [] },
        { id: "resource-item", platform: "rss", platformLabel: "RSS", sourceKind: "rss_feed", sourceKindLabel: "RSS feed", summary: "A release entry.", title: "Version 3.5 released", type: "Article", capabilities: [], url: "https://feeds.example/releases/3.5" },
      ],
    });
    const screen = await render(
      <UnfathomablySourceScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { sourceId: source.id, title: source.display_name } }}
      />,
    );

    await waitFor(() => {
      expect(mockGetSource).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        source.id,
      );
      expect(screen.getByText("source-status:source-wrapped-status")).toBeTruthy();
      expect(screen.getByText("Version 3.5 released")).toBeTruthy();
    });
  });
});

/* end of FediverseSourcesScreens.test.tsx */
