/*
    Project: Hoot Unfathomably
    --------------------------

    File: StatusCard.test.tsx

    Purpose:

        Verify the active status card against Unfathomably, Rebased, and
        Pleroma response shapes.

    Responsibilities:

        - Render common Mastodon status fields for every supported family
        - Cover Unfathomably/Rebased group context
        - Cover replies, reposts, quote reposts, media, and Pleroma reactions

    This file intentionally does NOT contain:

        - Deprecated post-cache fixtures
        - Live Fediverse requests
*/

import * as React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import StatusCard, { stripHtml } from "../StatusCard";
import * as UnfathomablyService from "../../services/UnfathomablyService";
import {
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    text: "#111",
    tint: "#d87900",
  }),
}));

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");

  return {
    __esModule: true,
    ...actual,
    dislikeStatus: jest.fn(),
    favouriteStatus: jest.fn(),
    reactToStatus: jest.fn(),
    reblogStatus: jest.fn(),
  };
});

const mockDislikeStatus =
  UnfathomablyService.dislikeStatus as jest.MockedFunction<
    typeof UnfathomablyService.dislikeStatus
  >;
const mockFavouriteStatus =
  UnfathomablyService.favouriteStatus as jest.MockedFunction<
    typeof UnfathomablyService.favouriteStatus
  >;
const mockReactToStatus =
  UnfathomablyService.reactToStatus as jest.MockedFunction<
    typeof UnfathomablyService.reactToStatus
  >;
const mockReblogStatus =
  UnfathomablyService.reblogStatus as jest.MockedFunction<
    typeof UnfathomablyService.reblogStatus
  >;

describe("StatusCard Fediverse contracts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)("renders a %s status", async (softwareName, family) => {
    const status = makeStatus(family);
    const screen = await render(
      <StatusCard
        status={status}
        ctx={makeContext(family)}
        navigation={{ navigate: jest.fn() }}
      />,
    );

    expect(screen.getByText(`${softwareName} Alice`)).toBeTruthy();
    expect(screen.getByText(`Hello from ${softwareName}.`)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reply to post" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Repost" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Quote repost" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "React with thumbs up" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "React with thumbs down" }),
    ).toBeTruthy();
  });

  test("opens Unfathomably group, reply, quote, and image destinations", async () => {
    const navigation = { navigate: jest.fn() };
    const status = makeStatus("unfathomably", {
      media_attachments: [
        {
          id: "image-1",
          type: "image",
          description: "A long screenshot",
          preview_url: "https://unfathomably.example/media/preview.png",
          url: "https://unfathomably.example/media/original.png",
        },
      ],
    });
    const screen = await render(
      <StatusCard
        status={status}
        ctx={makeContext("unfathomably")}
        navigation={navigation}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open group Unfathomably Test Group",
      }),
      { stopPropagation: jest.fn() },
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Group", {
      groupId: "unfathomably-group-1",
      title: "Unfathomably Test Group",
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Reply to post" }),
      { stopPropagation: jest.fn() },
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Root", {
      screen: "NewPostScreen",
      params: {
        groupId: "unfathomably-group-1",
        groupName: "Unfathomably Test Group",
        inReplyToId: "unfathomably-status-1",
      },
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Quote repost" }),
      { stopPropagation: jest.fn() },
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Root", {
      screen: "NewPostScreen",
      params: {
        groupId: "unfathomably-group-1",
        groupName: "Unfathomably Test Group",
        quoteId: "unfathomably-status-1",
      },
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Open image full screen" }),
      { stopPropagation: jest.fn() },
    );
    expect(navigation.navigate).toHaveBeenCalledWith("ImageViewer", {
      description: "A long screenshot",
      fallbackUri: "https://unfathomably.example/media/preview.png",
      uri: "https://unfathomably.example/media/original.png",
    });
  });

  test("uses the Pleroma reaction extension and removes an existing emoji", async () => {
    const updated = makeStatus("pleroma", {
      emoji_reactions: undefined,
      pleroma: {
        emoji_reactions: [{ name: "❤️", count: 1, me: false }],
      },
    });
    mockReactToStatus.mockResolvedValue(updated);
    const status = makeStatus("pleroma", {
      emoji_reactions: undefined,
      pleroma: {
        emoji_reactions: [{ name: "❤️", count: 2, me: true }],
      },
    });
    const screen = await render(
      <StatusCard
        status={status}
        ctx={makeContext("pleroma")}
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Choose an emoji reaction" }),
      { stopPropagation: jest.fn() },
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "React with ❤️" }),
      { stopPropagation: jest.fn() },
    );

    await waitFor(() => {
      expect(mockReactToStatus).toHaveBeenCalledWith(
        makeContext("pleroma"),
        "pleroma-status-1",
        "❤️",
        true,
      );
    });
  });

  test("uses favourite and dislike endpoints for thumbs up and down", async () => {
    mockFavouriteStatus.mockResolvedValue(
      makeStatus("rebased", {
        favourited: true,
        favourites_count: 6,
      }),
    );
    mockDislikeStatus.mockResolvedValue(
      makeStatus("rebased", {
        disliked: true,
        dislikes_count: 2,
      }),
    );
    const context = makeContext("rebased");
    const screen = await render(
      <StatusCard
        status={makeStatus("rebased")}
        ctx={context}
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "React with thumbs up" }),
      { stopPropagation: jest.fn() },
    );
    await waitFor(() => {
      expect(mockFavouriteStatus).toHaveBeenCalledWith(
        context,
        "rebased-status-1",
        false,
      );
      expect(
        screen.getByRole("button", { name: "Remove thumbs up" }),
      ).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "React with thumbs down" }),
      { stopPropagation: jest.fn() },
    );
    await waitFor(() => {
      expect(mockDislikeStatus).toHaveBeenCalledWith(
        context,
        "rebased-status-1",
        false,
      );
      expect(
        screen.getByRole("button", { name: "Remove thumbs down" }),
      ).toBeTruthy();
    });
  });

  test("reports a failed status action instead of silently doing nothing", async () => {
    mockFavouriteStatus.mockRejectedValue(new Error("permission denied"));
    const screen = await render(
      <StatusCard
        status={makeStatus("unfathomably")}
        ctx={makeContext("unfathomably")}
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "React with thumbs up" }),
      { stopPropagation: jest.fn() },
    );

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Could not add thumbs up",
        "permission denied",
      );
    });
  });

  test("updates a Rebased repost only after the server accepts it", async () => {
    const updated = makeStatus("rebased", {
      reblogged: true,
      reblogs_count: 4,
    });
    mockReblogStatus.mockResolvedValue(updated);
    const screen = await render(
      <StatusCard
        status={makeStatus("rebased")}
        ctx={makeContext("rebased")}
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Repost" }),
      { stopPropagation: jest.fn() },
    );

    await waitFor(() => {
      expect(mockReblogStatus).toHaveBeenCalledWith(
        makeContext("rebased"),
        "rebased-status-1",
        false,
      );
      expect(
        screen.getByRole("button", { name: "Undo repost" }),
      ).toBeTruthy();
    });
  });

  test("decodes status HTML without exposing markup", () => {
    expect(
      stripHtml("<p>Unfathomably &amp; Pleroma<br>Rebased &#128077;</p>"),
    ).toBe("Unfathomably & Pleroma\nRebased 👍");
  });
});

/* end of StatusCard.test.tsx */
