/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseRelationshipScreens.test.tsx

    Purpose:

        Verify the complete mobile people, follow, consent, and saved-post flow.

    Responsibilities:

        - Follow accounts from profiles across every supported server family
        - Search for people and accept incoming follow requests
        - Open follower/following results and bookmarked posts
        - Exercise mute and block confirmations without live mutations

    This file intentionally does NOT contain:

        - Live server credentials
        - Group or Source relationships
        - OAuth behavior
*/

import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AccountConnectionsScreen from "../AccountConnectionsScreen";
import AccountScreen from "../AccountScreen";
import PeopleScreen from "../PeopleScreen";
import SavedPostsScreen from "../SavedPostsScreen";
import {
  FediverseServerFamily,
  makeAccount,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockGetAccount = jest.fn();
const mockGetAccountFollowers = jest.fn();
const mockGetAccountFollowing = jest.fn();
const mockGetAccountRelationship = jest.fn();
const mockGetAccountStatuses = jest.fn();
const mockGetBookmarks = jest.fn();
const mockGetFollowRequests = jest.fn();
const mockResolveFollowRequest = jest.fn();
const mockSearchAccounts = jest.fn();
const mockSetAccountBlocked = jest.fn();
const mockSetAccountFollowed = jest.fn();
const mockSetAccountMuted = jest.fn();
let mockCurrentContext: LotideContext | undefined;

const families: FediverseServerFamily[] = [
  "akkoma",
  "mastodon",
  "pleroma",
  "rebased",
  "unfathomably",
];

function relationship(overrides = {}) {
  return {
    blocked_by: false,
    blocking: false,
    followed_by: false,
    following: false,
    id: "target-account",
    muting: false,
    requested: false,
    ...overrides,
  };
}

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    onTint: "#fff",
    red: "#b91c1c",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    tertiaryBackground: "#ddd",
    text: "#111",
    tint: "#7e0000",
  }),
}));

jest.mock("../../services/UnfathomablyAccountService", () => ({
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  getAccountFollowers: (...args: unknown[]) => mockGetAccountFollowers(...args),
  getAccountFollowing: (...args: unknown[]) => mockGetAccountFollowing(...args),
  getAccountRelationship: (...args: unknown[]) => mockGetAccountRelationship(...args),
  getBookmarks: (...args: unknown[]) => mockGetBookmarks(...args),
  getFollowRequests: (...args: unknown[]) => mockGetFollowRequests(...args),
  resolveFollowRequest: (...args: unknown[]) => mockResolveFollowRequest(...args),
  searchAccounts: (...args: unknown[]) => mockSearchAccounts(...args),
  setAccountBlocked: (...args: unknown[]) => mockSetAccountBlocked(...args),
  setAccountFollowed: (...args: unknown[]) => mockSetAccountFollowed(...args),
  setAccountMuted: (...args: unknown[]) => mockSetAccountMuted(...args),
}));

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");

  return {
    __esModule: true,
    ...actual,
    getAccountStatuses: (...args: unknown[]) => mockGetAccountStatuses(...args),
  };
});

jest.mock("../../components/StatusCard", () => {
  const actual = jest.requireActual("../../components/StatusCard");
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return {
    __esModule: true,
    ...actual,
    default: function MockStatusCard({ status }: { status: { id: string } }) {
      return React.createElement(Text, null, `status:${status.id}`);
    },
  };
});

describe("Fediverse relationship screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    const account = makeAccount("unfathomably", { id: "target-account" });
    mockGetAccount.mockResolvedValue(account);
    mockGetAccountFollowers.mockResolvedValue([]);
    mockGetAccountFollowing.mockResolvedValue([]);
    mockGetAccountRelationship.mockResolvedValue(relationship());
    mockGetAccountStatuses.mockResolvedValue([]);
    mockGetBookmarks.mockResolvedValue([]);
    mockGetFollowRequests.mockResolvedValue([]);
    mockResolveFollowRequest.mockResolvedValue(relationship({ followed_by: true }));
    mockSearchAccounts.mockResolvedValue([]);
    mockSetAccountBlocked.mockResolvedValue(relationship({ blocking: true }));
    mockSetAccountFollowed.mockResolvedValue(relationship({ following: true }));
    mockSetAccountMuted.mockResolvedValue(relationship({ muting: true }));
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each(families)("follows an account on %s", async family => {
    mockCurrentContext = makeContext(family);
    const account = makeAccount(family, { id: "target-account" });
    mockGetAccount.mockResolvedValue(account);
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <AccountScreen
        navigation={navigation as never}
        route={{ params: { account, accountId: account.id } } as never}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: `Follow ${account.display_name}`,
        }),
      ).toBeTruthy();
    });
    await fireEvent.press(
      screen.getByRole("button", { name: `Follow ${account.display_name}` }),
    );

    await waitFor(() => {
      expect(mockSetAccountFollowed).toHaveBeenCalledWith(
        makeContext(family),
        "target-account",
        true,
      );
      expect(
        screen.getByRole("button", { name: `Unfollow ${account.display_name}` }),
      ).toBeTruthy();
    });
  });

  test("cancels a pending follow request", async () => {
    const account = makeAccount("unfathomably", { id: "target-account", locked: true });
    mockGetAccount.mockResolvedValue(account);
    mockGetAccountRelationship.mockResolvedValue(relationship({ requested: true }));
    mockSetAccountFollowed.mockResolvedValue(relationship());
    const screen = await render(
      <AccountScreen
        navigation={{ navigate: jest.fn() } as never}
        route={{ params: { account, accountId: account.id } } as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Requested")).toBeTruthy();
    });
    await fireEvent.press(
      screen.getByRole("button", { name: `Unfollow ${account.display_name}` }),
    );
    expect(mockSetAccountFollowed).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      "target-account",
      false,
    );
  });

  test("confirms mute and block safety actions", async () => {
    const account = makeAccount("unfathomably", { id: "target-account" });
    const screen = await render(
      <AccountScreen
        navigation={{ navigate: jest.fn() } as never}
        route={{ params: { account, accountId: account.id } } as never}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Mute" }));
    const muteButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    await act(async () => {
      muteButtons?.[1].onPress();
    });
    await waitFor(() => {
      expect(mockSetAccountMuted).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "target-account",
        true,
      );
    });

    await fireEvent.press(screen.getByRole("button", { name: "Block" }));
    const blockButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    await act(async () => {
      blockButtons?.[1].onPress();
    });
    await waitFor(() => {
      expect(mockSetAccountBlocked).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "target-account",
        true,
      );
    });
  });

  test("searches for a federated account and opens its profile", async () => {
    const account = makeAccount("pleroma", { id: "remote-account" });
    mockSearchAccounts.mockResolvedValue([account]);
    const navigation = { navigate: jest.fn() };
    const screen = await render(<PeopleScreen navigation={navigation as never} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText("People search query"), "@alice@pleroma.example");
    await fireEvent.press(screen.getByRole("button", { name: "Search for people" }));
    await waitFor(() => expect(screen.getByText(account.display_name)).toBeTruthy());
    await fireEvent.press(
      screen.getByRole("button", { name: `Open profile for ${account.display_name}` }),
    );

    expect(mockSearchAccounts).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      "@alice@pleroma.example",
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Account", {
      account,
      accountId: "remote-account",
    });
  });

  test("accepts an incoming follow request", async () => {
    const account = makeAccount("unfathomably", { id: "request-account" });
    mockGetFollowRequests.mockResolvedValue([account]);
    const screen = await render(
      <PeopleScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
    );

    await fireEvent.press(screen.getByRole("tab", { name: "Follow requests" }));
    await waitFor(() => expect(screen.getByText(account.display_name)).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(mockResolveFollowRequest).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "request-account",
        true,
      );
      expect(screen.queryByText(account.display_name)).toBeNull();
    });
  });

  test("opens an account from a paged following list", async () => {
    const account = makeAccount("mastodon", { id: "followed-account" });
    mockGetAccountFollowing.mockResolvedValue([account]);
    const navigation = { push: jest.fn() };
    const screen = await render(
      <AccountConnectionsScreen
        navigation={navigation as never}
        route={{ params: { accountId: "owner", mode: "following" } } as never}
      />,
    );

    await waitFor(() => expect(screen.getByText(account.display_name)).toBeTruthy());
    await fireEvent.press(
      screen.getByRole("button", { name: `Open profile for ${account.display_name}` }),
    );
    expect(navigation.push).toHaveBeenCalledWith("Account", {
      account,
      accountId: account.id,
    });
  });

  test("loads bookmarked posts through the standard saved-post route", async () => {
    const status = makeStatus("unfathomably", { id: "saved-status" });
    mockGetBookmarks.mockResolvedValue([status]);
    const screen = await render(
      <SavedPostsScreen
        navigation={{ navigate: jest.fn() } as never}
        route={{} as never}
      />,
    );

    await waitFor(() => expect(screen.getByText("status:saved-status")).toBeTruthy());
    expect(mockGetBookmarks).toHaveBeenCalledWith(makeContext("unfathomably"));
  });
});

/* end of FediverseRelationshipScreens.test.tsx */
