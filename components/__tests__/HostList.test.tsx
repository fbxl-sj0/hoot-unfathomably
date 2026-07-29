/*
    Project: Hoot Unfathomably
    --------------------------

    File: HostList.test.tsx

    Purpose:

        Verify selection and restoration of arbitrary compatible servers.

    Responsibilities:

        • Cover the optional FBXL Social shortcut
        • Verify custom HTTPS and local-development server selection
        • Verify saved profiles retain their original server
        • Prevent unavailable seeded hosts from being selected

    This file intentionally does NOT contain:

        • Credential or browser OAuth tests
        • Live Fediverse requests
*/

import * as React from "react";
import { Alert } from "react-native";
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import HostList, {
  normalizeHostDomain,
  normalizeServerSelection,
  updateKnownHostInstanceInfo,
} from "../HostList";
import {
  FEDIVERSE_SERVERS,
  makeContext,
} from "../../testing/fediverseFixtures";

const mockDispatch = jest.fn();
const mockGetInstance = jest.fn();
const mockGetStore = jest.fn();
const mockActiveAccountStore = jest.fn();
const mockAccountProfilesStore = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryText: "#333",
    secondaryBackground: "#ddd",
    tertiaryBackground: "#eee",
    text: "#000",
    tint: "#f5a524",
  }),
}));

jest.mock("react-redux", () => ({
  ...jest.requireActual("react-redux"),
  useDispatch: () => mockDispatch,
}));

jest.mock("../../services/StorageService", () => ({
  __esModule: true,
  lotideContext: {
    store: (...args: unknown[]) => mockActiveAccountStore(...args),
  },
  lotideContextKV: {
    getStore: (...args: unknown[]) => mockGetStore(...args),
    store: (...args: unknown[]) => mockAccountProfilesStore(...args),
  },
}));

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");

  return {
    __esModule: true,
    ...actual,
    getInstance: (...args: unknown[]) => mockGetInstance(...args),
  };
});

const mockStore = configureStoreMock([]);

async function renderWithStore(ui: React.ReactElement) {
  return await render(
    <Provider store={mockStore({ lotide: { ctx: {} } })}>
      {ui}
    </Provider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe("HostList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetStore.mockResolvedValue({});
    mockGetInstance.mockResolvedValue({
      description: "A compatible server",
      title: "FBXL Social",
      version: "4.3.0",
    });
    mockActiveAccountStore.mockResolvedValue(undefined);
    mockAccountProfilesStore.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("makes the seeded FBXL host an optional shortcut", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    expect(screen.getByText("Login to continue")).toBeTruthy();
    expect(
      screen.getByText(/FBXL Social is only a shortcut/),
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText(
        "Server domain, e.g. example.social",
      ),
    ).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Select host FBXL Social" }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      "https://social.fbxl.net",
      "FBXL Social",
    );
    expect(mockGetInstance).toHaveBeenCalledWith(
      "https://social.fbxl.net",
    );
  });

  test("keeps a seeded host disabled until its compatibility probe succeeds", async () => {
    const instance = deferred<{
      title: string;
      version: string;
      description: string;
    }>();
    mockGetInstance.mockReturnValue(instance.promise);
    const screen = await renderWithStore(
      <HostList onSelect={jest.fn()} />,
    );
    const hostButton = screen.getByRole("button", {
      name: "Select host FBXL Social",
    });

    expect(hostButton.props.accessibilityState).toEqual({
      disabled: true,
    });

    instance.resolve({
      description: "Ready",
      title: "FBXL Social",
      version: "4.3.0",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Select host FBXL Social",
        }).props.accessibilityState,
      ).toEqual({ disabled: false });
    });
  });

  test("keeps a failed seeded shortcut disabled and offers retry", async () => {
    mockGetInstance
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        description: "Ready after retry",
        title: "FBXL Social",
        version: "4.3.0",
      });
    const screen = await renderWithStore(
      <HostList onSelect={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load info")).toBeTruthy();
      expect(
        screen.getByRole("button", {
          name: "Select host FBXL Social",
        }).props.accessibilityState,
      ).toEqual({ disabled: true });
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Retry host" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
      expect(mockGetInstance).toHaveBeenCalledTimes(2);
    });
  });

  test("selects a typed non-FBXL HTTPS server and removes pasted paths", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(
      "Server domain, e.g. example.social",
    );

    await waitFor(() => {
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });
    await fireEvent.changeText(
      input,
      " https://Pleroma.Example/a/pasted/path?from=browser ",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue" }),
    );

    expect(onSelect).toHaveBeenCalledWith("https://pleroma.example");
  });

  test("preserves explicit local HTTP ports for development servers", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });
    await fireEvent.changeText(
      screen.getByPlaceholderText(
        "Server domain, e.g. example.social",
      ),
      "http://10.0.2.2:4000/path",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue" }),
    );

    expect(onSelect).toHaveBeenCalledWith("http://10.0.2.2:4000");
  });

  test("rejects invalid and remote plaintext custom servers", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(
      "Server domain, e.g. example.social",
    );

    await waitFor(() => {
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });
    await fireEvent.changeText(input, "http://remote.example");
    expect(
      screen.getByRole("button", { name: "Continue" }).props
        .accessibilityState,
    ).toEqual({ disabled: true });

    await fireEvent(input, "submitEditing");

    expect(onSelect).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Enter a server",
      "Enter a valid HTTPS Unfathomably, Pleroma, Rebased, or Mastodon-compatible server.",
    );
  });

  test("persists a selected saved profile before activating it", async () => {
    const savedContext = {
      apiUrl: "https://pleroma.example",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
        },
      },
    };
    mockGetStore.mockResolvedValue({
      "alice@https://pleroma.example": savedContext,
    });
    const screen = await renderWithStore(
      <HostList onSelect={jest.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Select profile alice@pleroma.example",
        }),
      ).toBeTruthy();
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Select profile alice@pleroma.example",
      }),
    );

    await waitFor(() => {
      expect(mockAccountProfilesStore).toHaveBeenCalledWith(
        savedContext,
      );
      expect(mockActiveAccountStore).toHaveBeenCalledWith(savedContext);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: savedContext,
          type: "lotide/setCtx",
        }),
      );
    });
  });

  test("returns a locked saved profile to its original custom server", async () => {
    mockGetStore.mockResolvedValue({
      "alice@https://rebased.example": {
        apiUrl: "https://rebased.example",
      },
    });
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Select profile alice@rebased.example",
        }),
      ).toBeTruthy();
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Select profile alice@rebased.example",
      }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      "https://rebased.example",
      undefined,
      "alice",
    );
  });

  test("blocks duplicate saved-profile activation while storage is pending", async () => {
    const savedContext = {
      apiUrl: "https://pleroma.example",
      login: {
        token: "token-1",
        user: { id: 1, username: "alice" },
      },
    };
    const contextStore = deferred<void>();
    mockGetStore.mockResolvedValue({
      "alice@https://pleroma.example": savedContext,
    });
    mockAccountProfilesStore.mockReturnValue(contextStore.promise);
    const screen = await renderWithStore(
      <HostList onSelect={jest.fn()} />,
    );

    const profileButton = await waitFor(() =>
      screen.getByRole("button", {
        name: "Select profile alice@pleroma.example",
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Unfathomably 4.3.0")).toBeTruthy();
    });

    await fireEvent.press(profileButton);
    await fireEvent.press(profileButton);

    expect(mockAccountProfilesStore).toHaveBeenCalledTimes(1);

    contextStore.resolve(undefined);

    await waitFor(() => {
      expect(mockActiveAccountStore).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", {
          name: "Select profile alice@pleroma.example",
        }).props.accessibilityState,
      ).toEqual({ busy: false, disabled: false });
    });
  });

  test("normalizes server helpers independently of the seeded host list", () => {
    expect(normalizeServerSelection("Pleroma.Example/path")).toBe(
      FEDIVERSE_SERVERS.pleroma.origin,
    );
    expect(normalizeHostDomain("https://Pleroma.Example/path")).toBe(
      "pleroma.example",
    );
    expect(normalizeServerSelection("not a host")).toBe("");

    const hosts = [
      { domain: "social.fbxl.net", name: "FBXL Social" },
      { domain: "rebased.example", name: "Rebased Server" },
    ];
    const instanceInfo = makeContext("rebased").instanceInfo!;

    expect(
      updateKnownHostInstanceInfo(
        hosts,
        "rebased.example",
        instanceInfo,
      ),
    ).toEqual([
      hosts[0],
      {
        domain: "rebased.example",
        instanceInfo,
        name: "Rebased Server",
      },
    ]);
  });
});

/* end of HostList.test.tsx */
