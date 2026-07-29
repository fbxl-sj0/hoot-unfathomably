/*
    Project: Hoot Mobile
    -------------------

    File: EditCommunityScreen.test.tsx

    Purpose:

        Validate the Lotide community editing screen.

    Responsibilities:

        - Verify anonymous users are sent to the login prompt
        - Verify structured community descriptions become editable text
        - Verify submitted descriptions are trimmed before PATCH
        - Verify in-flight edits disable repeat submits

    This file intentionally does NOT contain:

        - Live Lotide community edit requests
        - Community detail rendering tests
        - Native keyboard behavior tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import EditCommunityScreen from "../EditCommunityScreen";

const mockEditCommunity = jest.fn();
const mockGetCommunity = jest.fn();
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
  getCommunity: (...args: unknown[]) => mockGetCommunity(...args),
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

const community: Community = {
  id: 7,
  name: "lotide",
  host: "lotide.fbxl.net",
  local: true,
  description: {
    content_markdown: "old **markdown**",
    content_text: "old text",
    content_html: "<p>old html</p>",
  },
};

const updatedCommunity: Community = {
  ...community,
  description: {
    content_markdown: "new markdown",
  },
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

async function renderEditCommunityScreen(
  routeCommunity: Community = community,
) {
  const navigation = {
    navigate: jest.fn(),
  };

  return {
    navigation,
    screen: await render(
      <EditCommunityScreen
        navigation={navigation as never}
        route={
          {
            key: "edit-community",
            name: "EditCommunity",
            params: {
              community: routeCommunity,
            },
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

describe("EditCommunityScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLotideCtx.mockReturnValue(ctx);
    mockEditCommunity.mockResolvedValue(undefined);
    mockGetCommunity.mockResolvedValue(updatedCommunity);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("prompts anonymous users to sign in", async () => {
    mockUseLotideCtx.mockReturnValue({ apiUrl: "https://lotide.fbxl.net/api/unstable" });

    await renderEditCommunityScreen();

    expect(mockSuggestLoginRender).toHaveBeenCalledTimes(1);
  });

  test("loads editable markdown and saves a trimmed description", async () => {
    const { navigation, screen } = await renderEditCommunityScreen();

    expect(screen.getByLabelText("Community description").props.value).toBe(
      "old **markdown**",
    );

    await changeTextAndFlush(
      screen.getByLabelText("Community description"),
      "  new markdown  ",
    );
    await pressAndFlush(screen.getByRole("button", {
      name: "Save community description",
    }));

    await waitFor(() => {
      expect(mockEditCommunity).toHaveBeenCalledWith(ctx, 7, "new markdown");
      expect(mockGetCommunity).toHaveBeenCalledWith(ctx, 7);
      expect(navigation.navigate).toHaveBeenCalledWith("Community", {
        community: updatedCommunity,
      });
    });
  });

  test("reports edit failures without navigating away", async () => {
    mockEditCommunity.mockRejectedValue(new Error("edit rejected"));
    const { navigation, screen } = await renderEditCommunityScreen();

    await pressAndFlush(screen.getByRole("button", {
      name: "Save community description",
    }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Failed to edit community",
        "edit rejected",
      );
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  test("disables the save button while the edit is pending", async () => {
    const pendingEdit = createDeferred<void>();
    mockEditCommunity.mockReturnValue(pendingEdit.promise);
    const { screen } = await renderEditCommunityScreen();

    const button = screen.getByRole("button", {
      name: "Save community description",
    });

    await pressAndFlush(button);
    await pressAndFlush(screen.getByRole("button", {
      name: "Save community description",
    }));

    await waitFor(() => {
      expect(mockEditCommunity).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", {
          name: "Save community description",
        }).props.accessibilityState.disabled,
      ).toBe(true);
      expect(screen.getByText("Saving...")).toBeTruthy();
    });

    await act(async () => {
      pendingEdit.resolve(undefined);
      await Promise.resolve();
    });
  });

  test("ignores successful edits after leaving the screen", async () => {
    const pendingEdit = createDeferred<void>();
    mockEditCommunity.mockReturnValue(pendingEdit.promise);
    const { navigation, screen } = await renderEditCommunityScreen();

    await pressAndFlush(screen.getByRole("button", {
      name: "Save community description",
    }));

    await waitFor(() => {
      expect(mockEditCommunity).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedEdit = pendingEdit.promise.then(() => undefined);
    pendingEdit.resolve(undefined);

    await drainedEdit;
    await Promise.resolve();

    expect(mockGetCommunity).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test("ignores edit failures after leaving the screen", async () => {
    const pendingEdit = createDeferred<void>();
    mockEditCommunity.mockReturnValue(pendingEdit.promise);
    const { screen } = await renderEditCommunityScreen();

    await pressAndFlush(screen.getByRole("button", {
      name: "Save community description",
    }));

    await waitFor(() => {
      expect(mockEditCommunity).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedEdit = pendingEdit.promise.catch(() => undefined);
    pendingEdit.reject(new Error("late edit failure"));

    await drainedEdit;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Failed to edit community",
      "late edit failure",
    );
  });
});

/* end of EditCommunityScreen.test.tsx */
