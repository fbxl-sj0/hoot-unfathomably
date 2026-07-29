/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseDiscussionScreens.test.tsx

    Purpose:

        Verify composing and reading discussions with Mastodon-compatible
        status contracts and Unfathomably/Rebased extensions.

    Responsibilities:

        - Publish Pleroma-compatible replies
        - Publish Rebased quote reposts
        - Publish Unfathomably group posts
        - Load status ancestors and descendants

    This file intentionally does NOT contain:

        - Deprecated comment-tree fixtures
        - Live publishing
*/

import * as React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ComposeStatusScreen from "../ComposeStatusScreen";
import StatusThreadScreen from "../StatusThreadScreen";
import {
  makeContext,
  makeGroup,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockCreateStatus = jest.fn();
const mockGetGroups = jest.fn();
const mockGetStatus = jest.fn();
const mockGetStatusContext = jest.fn();
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
    text: "#111",
    tint: "#d87900",
  }),
}));

jest.mock("../../services/UnfathomablyService", () => ({
  createStatus: (...args: unknown[]) => mockCreateStatus(...args),
  getGroups: (...args: unknown[]) => mockGetGroups(...args),
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  getStatusContext: (...args: unknown[]) =>
    mockGetStatusContext(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const actual = jest.requireActual("../../components/StatusCard");
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return {
    __esModule: true,
    ...actual,
    default: function MockStatusCard({
      compact,
      status,
    }: {
      compact?: boolean;
      status: { id: string };
    }) {
      return React.createElement(
        Text,
        null,
        `${compact ? "compact" : "status"}:${status.id}`,
      );
    },
  };
});

describe("Fediverse discussion screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCurrentContext = makeContext("unfathomably");
    mockGetGroups.mockResolvedValue([]);
    mockGetStatus.mockResolvedValue(makeStatus("unfathomably"));
    mockGetStatusContext.mockResolvedValue({
      ancestors: [],
      descendants: [],
    });
    mockCreateStatus.mockResolvedValue(makeStatus("unfathomably"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("publishes a Pleroma-compatible reply with the selected server context", async () => {
    mockCurrentContext = makeContext("pleroma");
    const target = makeStatus("pleroma");
    const created = makeStatus("pleroma", { id: "pleroma-reply-2" });
    mockGetStatus.mockResolvedValue(target);
    mockCreateStatus.mockResolvedValue(created);
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { inReplyToId: target.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Pleroma Alice")).toBeTruthy();
      expect(screen.getByText("Hello from Pleroma.")).toBeTruthy();
    });
    await fireEvent.changeText(
      screen.getByPlaceholderText("Write a reply"),
      " A compatible reply ",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Reply" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("pleroma"),
        "A compatible reply",
        {
          groupId: undefined,
          inReplyToId: target.id,
          quoteId: undefined,
        },
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Status", {
        statusId: "pleroma-reply-2",
      });
    });
  });

  test("publishes a Rebased quote repost with a selected group", async () => {
    mockCurrentContext = makeContext("rebased");
    const target = makeStatus("rebased");
    const group = makeGroup("rebased");
    mockGetStatus.mockResolvedValue(target);
    mockGetGroups.mockResolvedValue([group]);
    mockCreateStatus.mockResolvedValue(
      makeStatus("rebased", { id: "rebased-quote-2" }),
    );
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { quoteId: target.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(group.display_name)).toBeTruthy();
      expect(screen.getByText("Hello from Rebased.")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText(group.display_name));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Add your thoughts"),
      "Worth sharing",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Publish quote" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("rebased"),
        "Worth sharing",
        {
          groupId: group.id,
          inReplyToId: undefined,
          quoteId: target.id,
        },
      );
    });
  });

  test("publishes directly into an Unfathomably group", async () => {
    const group = makeGroup("unfathomably");
    mockGetGroups.mockResolvedValue([group]);
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn() }}
        route={{
          params: {
            groupId: group.id,
            groupName: group.display_name,
          },
        }}
      />,
    );

    expect(screen.getByText("New group post")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByPlaceholderText("What's happening?"),
      "Group release notes",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Publish" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "Group release notes",
        {
          groupId: group.id,
          inReplyToId: undefined,
          quoteId: undefined,
        },
      );
    });
  });

  test("loads a Rebased thread with ancestors and descendants", async () => {
    mockCurrentContext = makeContext("rebased");
    const current = makeStatus("rebased", { id: "current-status" });
    const ancestor = makeStatus("rebased", { id: "ancestor-status" });
    const descendant = makeStatus("rebased", {
      id: "descendant-status",
    });
    mockGetStatus.mockResolvedValue(current);
    mockGetStatusContext.mockResolvedValue({
      ancestors: [ancestor],
      descendants: [descendant],
    });
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <StatusThreadScreen
        navigation={navigation}
        route={{ params: { statusId: current.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("compact:ancestor-status")).toBeTruthy();
      expect(screen.getByText("status:current-status")).toBeTruthy();
      expect(screen.getByText("status:descendant-status")).toBeTruthy();
    });
    expect(mockGetStatus).toHaveBeenCalledWith(
      makeContext("rebased"),
      current.id,
    );
    expect(mockGetStatusContext).toHaveBeenCalledWith(
      makeContext("rebased"),
      current.id,
    );

    await fireEvent.press(screen.getByText(/Reply/));
    expect(navigation.navigate).toHaveBeenCalledWith("NewPostScreen", {
      inReplyToId: current.id,
    });
  });
});

/* end of FediverseDiscussionScreens.test.tsx */
