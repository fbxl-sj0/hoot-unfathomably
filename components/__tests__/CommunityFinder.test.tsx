/*
    Project: Hoot Mobile
    -------------------

    File: CommunityFinder.test.tsx

    Purpose:

        Validate the community picker used by post creation and
        community selection flows.

    Responsibilities:

        • Verify Lotide communities load from the service layer
        • Verify filtering does not select hidden communities
        • Verify failed loads and only-when-typing mode stay safe

    This file intentionally does NOT contain:

        • New post submit tests
        • Live Lotide network tests
        • Community detail screen tests
*/

import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import CommunityFinder from "../CommunityFinder";

const mockGetAllCommunities = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryText: "#333",
    placeholderText: "#999",
    text: "#000",
    secondaryTint: "#090",
    tertiaryBackground: "#eee",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getAllCommunities: (...args: unknown[]) => mockGetAllCommunities(...args),
}));

const mockStore = configureStoreMock([]);

function renderWithStore(ui: React.ReactElement, ctx: LotideContext = {}) {
  return render(<Provider store={mockStore({ lotide: { ctx } })}>{ui}</Provider>);
}

function deferred<T>() {
  let resolveValue: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectValue: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });

  return {
    promise,
    resolve: resolveValue,
    reject: rejectValue,
  };
}

describe("CommunityFinder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllCommunities.mockResolvedValue([
      {
        id: 1,
        name: "lotide",
        host: "lotide.fbxl.net",
        local: false,
      },
      {
        id: 2,
        name: "narwhal",
        host: "narwhal.city",
        local: false,
      },
    ]);
  });

  test("renders communities and calls onSelect when a row is tapped", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(
      <CommunityFinder onSelect={onSelect} />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledTimes(1);
      expect(screen.getByText("lotide")).toBeTruthy();
      expect(screen.getByText("narwhal")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Select community lotide@lotide.fbxl.net",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: "lotide",
      }),
    );
  });

  test("loads only followed communities when requested", async () => {
    await renderWithStore(
      <CommunityFinder onlyFollowing onSelect={() => {}} />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledWith(
        expect.objectContaining({
          login: { token: "token-1" },
        }),
        true,
      );
    });
  });

  test("filters community list when text is entered", async () => {
    const screen = await renderWithStore(<CommunityFinder onSelect={() => {}} />, {
      login: { token: "token-1" },
    });

    await waitFor(() => {
      expect(screen.getByText("lotide")).toBeTruthy();
      expect(screen.getByText("narwhal")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByPlaceholderText("Filter communities"), "narwh");

    await waitFor(() => {
      expect(screen.getByText("narwhal")).toBeTruthy();
      expect(screen.queryByText("lotide")).toBeNull();
    });
  });

  test("shows loading while community results are pending", async () => {
    const request = deferred<Community[]>();
    mockGetAllCommunities.mockReturnValue(request.promise);

    const screen = await renderWithStore(<CommunityFinder onSelect={() => {}} />, {
      login: { token: "token-1" },
    });

    expect(screen.getByText("Loading communities...")).toBeTruthy();

    await act(async () => {
      request.resolve([
        {
          id: 1,
          name: "lotide",
          host: "lotide.fbxl.net",
          local: false,
        },
      ]);
      await request.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading communities...")).toBeNull();
      expect(screen.getByText("lotide")).toBeTruthy();
    });
  });

  test("keeps results hidden until typing when requested", async () => {
    const screen = await renderWithStore(
      <CommunityFinder onlyWhenTyping onSelect={() => {}} />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("lotide")).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText("Filter communities"), "lot");

    await waitFor(() => {
      expect(screen.getByText("lotide")).toBeTruthy();
      expect(screen.queryByText("narwhal")).toBeNull();
    });
  });

  test("shows a retry action when community loading fails", async () => {
    mockGetAllCommunities
      .mockRejectedValueOnce(new Error("server unavailable"))
      .mockResolvedValueOnce([
        {
          id: 1,
          name: "lotide",
          host: "lotide.fbxl.net",
          local: false,
        },
      ]);

    const screen = await renderWithStore(<CommunityFinder onSelect={() => {}} />, {
      login: { token: "token-1" },
    });

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Cannot load communities")).toBeTruthy();
    });
    expect(screen.getByPlaceholderText("Filter communities")).toBeTruthy();
    expect(screen.queryByText("lotide")).toBeNull();
    expect(screen.queryByText("narwhal")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledTimes(2);
      expect(screen.getByText("lotide")).toBeTruthy();
      expect(screen.queryByText("Cannot load communities")).toBeNull();
    });
  });

  test("explains empty filtered community results", async () => {
    const screen = await renderWithStore(<CommunityFinder onSelect={() => {}} />, {
      login: { token: "token-1" },
    });

    await waitFor(() => {
      expect(screen.getByText("lotide")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByPlaceholderText("Filter communities"), "zzzz");

    expect(screen.getByText("No matching communities")).toBeTruthy();
  });
});

/* end of CommunityFinder.test.tsx */
