/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseGroupsScreens.test.tsx

    Purpose:

        Verify group discovery and discussion screens against the
        Unfathomably/Rebased group extension.

    Responsibilities:

        - Browse and search groups on supported servers
        - Read group statuses and update membership
        - Degrade cleanly when a baseline server lacks group endpoints

    This file intentionally does NOT contain:

        - Deprecated community API fixtures
        - Live group mutations
*/

import * as React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import GroupScreen from "../GroupScreen";
import GroupsScreen from "../GroupsScreen";
import {
  makeContext,
  makeGroup,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockGetGroups = jest.fn();
const mockGetGroup = jest.fn();
const mockGetDiscoverableGroups = jest.fn();
const mockGetGroupStatuses = jest.fn();
const mockJoinGroup = jest.fn();
const mockUseStream = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useUnfathomablyStream", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseStream(...args),
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
  getDiscoverableGroups: (...args: unknown[]) => mockGetDiscoverableGroups(...args),
  getGroup: (...args: unknown[]) => mockGetGroup(...args),
  getGroups: (...args: unknown[]) => mockGetGroups(...args),
  getGroupStatuses: (...args: unknown[]) =>
    mockGetGroupStatuses(...args),
  joinGroup: (...args: unknown[]) => mockJoinGroup(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return function MockStatusCard({
    status,
  }: {
    status: { id: string };
  }) {
    return React.createElement(Text, null, `status:${status.id}`);
  };
});

describe("Fediverse group screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCurrentContext = makeContext("unfathomably");
    mockGetGroups.mockResolvedValue([]);
    mockGetGroup.mockResolvedValue(makeGroup("unfathomably"));
    mockGetDiscoverableGroups.mockResolvedValue([]);
    mockGetGroupStatuses.mockResolvedValue([]);
    mockJoinGroup.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
  ] as const)("discovers and opens a %s group", async (_label, family) => {
    mockCurrentContext = makeContext(family);
    const group = makeGroup(family);
    mockGetGroups.mockResolvedValue([group]);
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <GroupsScreen navigation={navigation} />,
    );

    await waitFor(() => {
      expect(screen.getByText(group.display_name)).toBeTruthy();
      expect(screen.getByText("A federated group discussion.")).toBeTruthy();
      expect(screen.getByText("42 members")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: `Open group ${group.display_name}`,
      }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Group", {
      groupId: group.id,
      title: group.display_name,
    });
  });

  test("submits a Rebased group search without changing host context", async () => {
    mockCurrentContext = makeContext("rebased");
    mockGetGroups.mockResolvedValue([]);
    const screen = await render(
      <GroupsScreen navigation={{ navigate: jest.fn() }} />,
    );

    await waitFor(() => {
      expect(mockGetGroups).toHaveBeenCalledWith(
        makeContext("rebased"),
        "",
      );
    });
    await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Find a group"),
      "release engineering",
    );
    await fireEvent(
      screen.getByPlaceholderText("Find a group"),
      "submitEditing",
    );

    await waitFor(() => {
      expect(mockGetGroups).toHaveBeenLastCalledWith(
        makeContext("rebased"),
        "release engineering",
      );
    });
  });

  test.each([
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
    ["Pleroma", "pleroma"],
  ] as const)("shows a useful error on %s without the groups extension", async (_name, family) => {
    mockCurrentContext = makeContext(family);
    mockGetGroups.mockRejectedValue(
      new Error("Groups are not available on this server."),
    );
    const screen = await render(
      <GroupsScreen navigation={{ navigate: jest.fn() }} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Groups are not available on this server.",
        ),
      ).toBeTruthy();
    });
  });

  test("loads an Unfathomably group discussion and leaves a joined group", async () => {
    const group = makeGroup("unfathomably", {
      relationship: { member: true, requested: false },
    });
    const status = makeStatus("unfathomably");
    mockGetGroup.mockResolvedValue(group);
    mockGetGroupStatuses.mockResolvedValue([status]);
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <GroupScreen
        navigation={navigation}
        route={{
          params: {
            groupId: group.id,
            title: group.display_name,
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(group.display_name)).toBeTruthy();
      expect(
        screen.getByText(`status:${status.id}`),
      ).toBeTruthy();
    });
    expect(mockUseStream).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      { stream: "group", group: group.id },
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Leave group" }),
    );

    await waitFor(() => {
      expect(mockJoinGroup).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        group.id,
        true,
      );
      expect(mockGetGroup).toHaveBeenCalledTimes(2);
      expect(mockGetGroupStatuses).toHaveBeenCalledTimes(2);
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Write to group" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Root", {
      screen: "NewPostScreen",
      params: {
        composeIntentId: expect.any(String),
        groupId: group.id,
        groupName: group.display_name,
        inReplyToId: undefined,
        quoteId: undefined,
        quoteParameter: undefined,
      },
    });
  });

  test("does not present group data without an authenticated context", async () => {
    mockCurrentContext = undefined;
    const screen = await render(
      <GroupScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { groupId: "unfathomably-group-1" } }}
      />,
    );

    expect(screen.toJSON()).toBeNull();
    expect(mockGetGroup).not.toHaveBeenCalled();
    expect(mockGetGroupStatuses).not.toHaveBeenCalled();
  });
});

/* end of FediverseGroupsScreens.test.tsx */
