/*
    Project: Hoot Mobile
    -------------------

    File: NewCommunity.test.tsx

    Purpose:

        Validate the Lotide community creation screen.

    Responsibilities:

        - Verify anonymous users are sent to the login prompt
        - Verify community names and descriptions are trimmed before submission
        - Verify created communities still open when optional setup fails
        - Verify in-flight community creation disables repeat submits

    This file intentionally does NOT contain:

        - Live Lotide community creation requests
        - Community detail rendering tests
        - Native keyboard behavior tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import NewCommunityScreen from "../NewCommunity";

const mockEditCommunity = jest.fn();
const mockFollowCommunity = jest.fn();
const mockGetCommunity = jest.fn();
const mockNewCommunity = jest.fn();
const mockSuggestLoginRender = jest.fn();
const mockUseLotideCtx = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    placeholderText: "#999",
    secondaryText: "#333",
    text: "#000",
    tint: "#f5a524",
  }),
}));

jest.mock("../../hooks/useLotideCtx", () => ({
  __esModule: true,
  useLotideCtx: () => mockUseLotideCtx(),
}));

jest.mock("../../components/SuggestLogin", () => ({
  __esModule: true,
  default: () => {
    mockSuggestLoginRender();
    return null;
  },
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  editCommunity: (...args: unknown[]) => mockEditCommunity(...args),
  followCommunity: (...args: unknown[]) => mockFollowCommunity(...args),
  getCommunity: (...args: unknown[]) => mockGetCommunity(...args),
  newCommunity: (...args: unknown[]) => mockNewCommunity(...args),
}));

const ctx: LotideContext = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
  login: {
    token: "token-1",
    user: {
      id: 1,
      username: "sj_zero",
      host: "lotide.fbxl.net",
      local: true,
    },
  },
};

const createdCommunity: Community = {
  id: 99,
  name: "lotide",
  host: "lotide.fbxl.net",
  local: true,
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

async function renderNewCommunityScreen() {
  const navigation = {
    replace: jest.fn(),
  };

  return {
    navigation,
    screen: await render(
      <NewCommunityScreen
        navigation={navigation as never}
        route={
          {
            key: "new-community",
            name: "NewCommunity",
          } as never
        }
      />,
    ),
  };
}

async function flushAsyncState() {
  await Promise.resolve();
  await Promise.resolve();
}

async function changeTextAndFlush(
  element: ReturnType<Awaited<ReturnType<typeof render>>["getByLabelText"]>,
  value: string,
) {
  await fireEvent.changeText(element, value);

  await act(async () => {
    await flushAsyncState();
  });
}

async function pressAndFlush(
  element: ReturnType<Awaited<ReturnType<typeof render>>["getByRole"]>,
) {
  await fireEvent.press(element);

  await act(async () => {
    await flushAsyncState();
  });
}

describe("NewCommunityScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLotideCtx.mockReturnValue(ctx);
    mockNewCommunity.mockResolvedValue({ community: { id: 99 } });
    mockEditCommunity.mockResolvedValue(undefined);
    mockFollowCommunity.mockResolvedValue({ accepted: true });
    mockGetCommunity.mockResolvedValue(createdCommunity);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("prompts anonymous users to sign in", async () => {
    mockUseLotideCtx.mockReturnValue({ apiUrl: "https://lotide.fbxl.net/api/unstable" });

    await renderNewCommunityScreen();

    expect(mockSuggestLoginRender).toHaveBeenCalledTimes(1);
  });

  test("creates a community with trimmed name and description", async () => {
    const { navigation, screen } = await renderNewCommunityScreen();

    await changeTextAndFlush(
      screen.getByLabelText("Community name"),
      "  lotide  ",
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Community description")).toBeTruthy();
    });

    await changeTextAndFlush(
      screen.getByLabelText("Community description"),
      "  federated things  ",
    );
    await pressAndFlush(screen.getByRole("button", { name: "Create new community" }));

    await waitFor(() => {
      expect(mockNewCommunity).toHaveBeenCalledWith(ctx, "lotide");
      expect(mockEditCommunity).toHaveBeenCalledWith(
        ctx,
        99,
        "federated things",
      );
      expect(mockFollowCommunity).toHaveBeenCalledWith(ctx, 99);
      expect(mockGetCommunity).toHaveBeenCalledWith(ctx, 99);
      expect(navigation.replace).toHaveBeenCalledWith("Community", {
        community: createdCommunity,
      });
    });
  });

  test("still opens the created community when optional setup fails", async () => {
    mockEditCommunity.mockRejectedValue(new Error("description rejected"));
    mockFollowCommunity.mockRejectedValue(new Error("follow rejected"));
    const { navigation, screen } = await renderNewCommunityScreen();

    await changeTextAndFlush(screen.getByLabelText("Community name"), "lotide");
    await waitFor(() => {
      expect(screen.getByLabelText("Community description")).toBeTruthy();
    });
    await changeTextAndFlush(
      screen.getByLabelText("Community description"),
      "hello",
    );
    await pressAndFlush(screen.getByRole("button", { name: "Create new community" }));

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("Community", {
        community: createdCommunity,
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Community created",
        [
          "Description was not saved: description rejected",
          "Follow did not complete: follow rejected",
        ].join("\n"),
      );
    });
  });

  test("disables the create button while creation is pending", async () => {
    const pendingCommunity = createDeferred<{ community: { id: CommunityId } }>();
    mockNewCommunity.mockReturnValue(pendingCommunity.promise);
    const { screen } = await renderNewCommunityScreen();

    await changeTextAndFlush(screen.getByLabelText("Community name"), "lotide");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create new community" }))
        .toBeTruthy();
    });
    const button = screen.getByRole("button", {
      name: "Create new community",
    });

    await pressAndFlush(button);
    await pressAndFlush(screen.getByRole("button", {
      name: "Create new community",
    }));

    await waitFor(() => {
      expect(mockNewCommunity).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "Create new community" }).props
          .accessibilityState.disabled,
      ).toBe(true);
      expect(screen.getByText("Creating...")).toBeTruthy();
    });

    await act(async () => {
      pendingCommunity.resolve({ community: { id: 99 } });
      await Promise.resolve();
    });
  });

  test("ignores successful creation after leaving the screen", async () => {
    const pendingCommunity = createDeferred<{ community: { id: CommunityId } }>();
    mockNewCommunity.mockReturnValue(pendingCommunity.promise);
    const { navigation, screen } = await renderNewCommunityScreen();

    await changeTextAndFlush(screen.getByLabelText("Community name"), "lotide");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create new community" }))
        .toBeTruthy();
    });
    await pressAndFlush(screen.getByRole("button", { name: "Create new community" }));

    await waitFor(() => {
      expect(mockNewCommunity).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedCreation = pendingCommunity.promise.then(() => undefined);
    pendingCommunity.resolve({ community: { id: 99 } });

    await drainedCreation;
    await Promise.resolve();

    expect(mockEditCommunity).not.toHaveBeenCalled();
    expect(mockFollowCommunity).not.toHaveBeenCalled();
    expect(mockGetCommunity).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test("ignores creation failures after leaving the screen", async () => {
    const pendingCommunity = createDeferred<{ community: { id: CommunityId } }>();
    mockNewCommunity.mockReturnValue(pendingCommunity.promise);
    const { screen } = await renderNewCommunityScreen();

    await changeTextAndFlush(screen.getByLabelText("Community name"), "lotide");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create new community" }))
        .toBeTruthy();
    });
    await pressAndFlush(screen.getByRole("button", { name: "Create new community" }));

    await waitFor(() => {
      expect(mockNewCommunity).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedCreation = pendingCommunity.promise.catch(() => undefined);
    pendingCommunity.reject(new Error("late create failure"));

    await drainedCreation;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Failed to create community",
      "late create failure",
    );
  });
});

/* end of NewCommunity.test.tsx */
