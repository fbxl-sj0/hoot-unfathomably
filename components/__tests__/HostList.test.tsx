/*
    Project: Hoot Mobile
    -------------------

    File: HostList.test.tsx

    Purpose:

        Validate the Lotide host/profile picker shown during login.

    Responsibilities:

        • Verify known hosts and saved profiles render
        • Verify known hosts call onSelect only when compatible
        • Verify typed custom hostnames are normalized before selection

    This file intentionally does NOT contain:

        • Login form submission tests
        • Persistent storage implementation tests
        • Live instance discovery tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import HostList, { updateKnownHostInstanceInfo } from "../HostList";

const mockGetStore = jest.fn();
const mockGetInstanceInfo = jest.fn();
const mockDispatch = jest.fn();
const mockLotideContextStore = jest.fn();
const mockLotideContextKVStore = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryText: "#333",
    secondaryBackground: "#ddd",
    tertiaryBackground: "#eee",
    tint: "#f5a524",
  }),
}));

jest.mock("react-redux", () => ({
  ...jest.requireActual("react-redux"),
  useDispatch: () => mockDispatch,
}));

jest.mock("../../services/StorageService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/StorageService"),
  lotideContext: {
    ...jest.requireActual("../../services/StorageService").lotideContext,
    store: (...args: unknown[]) => mockLotideContextStore(...args),
  },
  lotideContextKV: {
    ...jest.requireActual("../../services/StorageService").lotideContextKV,
    getStore: (...args: unknown[]) => mockGetStore(...args),
    store: (...args: unknown[]) => mockLotideContextKVStore(...args),
  },
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getInstanceInfo: (...args: unknown[]) => mockGetInstanceInfo(...args),
}));

const mockStore = configureStoreMock([]);

function renderWithStore(ui: React.ReactElement, ctx: LotideContext = {}) {
  return render(<Provider store={mockStore({ lotide: { ctx } })}>{ui}</Provider>);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("HostList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetStore.mockResolvedValue({});
    mockLotideContextStore.mockResolvedValue(undefined);
    mockLotideContextKVStore.mockResolvedValue(undefined);
    mockGetInstanceInfo.mockResolvedValue({
      software: { name: "Hoot", version: "0.19.0" },
      apiVersion: 19,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("renders the seeded known hosts and existing profiles", async () => {
    mockGetStore.mockResolvedValue({
      "alice@https://lotide.fbxl.net": {
        login: { user: { id: 1, username: "alice" } },
        apiUrl: "https://lotide.fbxl.net",
      },
    });

    const onSelect = jest.fn();

    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    expect(screen.getByText("Login to continue")).toBeTruthy();
    expect(screen.getByText("Or sign into a new account")).toBeTruthy();
    expect(screen.getByPlaceholderText("Host domain")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByText("FBXL Lotide").length).toBeGreaterThan(0);
      expect(screen.getByText("Narwhal City")).toBeTruthy();
      expect(screen.getByText("Narwhal City (Dev)")).toBeTruthy();
      expect(screen.getAllByText("Hoot 0.19.0")).toHaveLength(3);
    });

    expect(screen.getByText("alice")).toBeTruthy();
    expect(screen.getAllByText("lotide.fbxl.net").length).toBeGreaterThan(0);
  });

  test("persists a selected saved profile before activating it", async () => {
    const savedContext = {
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
          local: true,
        },
      },
      apiUrl: "https://lotide.fbxl.net/api/unstable",
    };
    mockGetStore.mockResolvedValue({
      "alice@https://lotide.fbxl.net/api/unstable": savedContext,
    });

    const screen = await renderWithStore(<HostList onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Select profile alice@lotide.fbxl.net",
      }),
    );

    await waitFor(() => {
      expect(mockLotideContextKVStore).toHaveBeenCalledWith(savedContext);
      expect(mockLotideContextStore).toHaveBeenCalledWith(savedContext);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lotide/setCtx",
          payload: savedContext,
        }),
      );
    });
  });

  test("ignores duplicate saved profile activation while storage is pending", async () => {
    const savedContext = {
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
          local: true,
        },
      },
      apiUrl: "https://lotide.fbxl.net/api/unstable",
    };
    const kvStore = createDeferred<void>();
    const activeStore = createDeferred<void>();

    mockGetStore.mockResolvedValue({
      "alice@https://lotide.fbxl.net/api/unstable": savedContext,
    });
    mockLotideContextKVStore.mockReturnValue(kvStore.promise);
    mockLotideContextStore.mockReturnValue(activeStore.promise);

    const screen = await renderWithStore(<HostList onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeTruthy();
      expect(screen.getAllByText("Hoot 0.19.0")).toHaveLength(3);
    });

    fireEvent.press(
      screen.getByRole("button", {
        name: "Select profile alice@lotide.fbxl.net",
      }),
    );

    await waitFor(() => {
      expect(mockLotideContextKVStore).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", {
          name: "Select profile alice@lotide.fbxl.net",
        }).props.accessibilityState,
      ).toEqual({ busy: true, disabled: true });
    });

    fireEvent.press(
      screen.getByRole("button", {
        name: "Select profile alice@lotide.fbxl.net",
      }),
    );
    expect(mockLotideContextKVStore).toHaveBeenCalledTimes(1);

    await act(async () => {
      kvStore.resolve(undefined);
      await kvStore.promise;
    });

    await waitFor(() => {
      expect(mockLotideContextStore).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      activeStore.resolve(undefined);
      await activeStore.promise;
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lotide/setCtx",
          payload: savedContext,
        }),
      );
      expect(
        screen.getByRole("button", {
          name: "Select profile alice@lotide.fbxl.net",
        }).props.accessibilityState,
      ).toEqual({ busy: false, disabled: false });
    });
  });

  test("does not alert when saved profile activation fails after unmount", async () => {
    const savedContext = {
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
          local: true,
        },
      },
      apiUrl: "https://lotide.fbxl.net/api/unstable",
    };
    const kvStore = createDeferred<void>();

    mockGetStore.mockResolvedValue({
      "alice@https://lotide.fbxl.net/api/unstable": savedContext,
    });
    mockLotideContextKVStore.mockReturnValue(kvStore.promise);

    const screen = await renderWithStore(<HostList onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeTruthy();
    });

    fireEvent.press(
      screen.getByRole("button", {
        name: "Select profile alice@lotide.fbxl.net",
      }),
    );

    await waitFor(() => {
      expect(mockLotideContextKVStore).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", {
          name: "Select profile alice@lotide.fbxl.net",
        }).props.accessibilityState,
      ).toEqual({ busy: true, disabled: true });
    });

    screen.unmount();

    kvStore.reject(new Error("storage failed"));
    await kvStore.promise.catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test("filters hosts and selects the chosen host", async () => {
    const onSelect = jest.fn();

    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getAllByText("Hoot 0.19.0")).toHaveLength(3);
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Select host FBXL Lotide" }),
    );
    expect(onSelect).toHaveBeenCalledWith("lotide.fbxl.net", "FBXL Lotide");

    await fireEvent.changeText(screen.getByPlaceholderText("Host domain"), "narwhal");

    await waitFor(() => {
      expect(screen.getByText("Narwhal City")).toBeTruthy();
      expect(screen.getByText("Narwhal City (Dev)")).toBeTruthy();
    });
    expect(screen.queryByText("FBXL Lotide")).toBeNull();
  });

  test("does not select hosts whose API version is too old", async () => {
    mockGetInstanceInfo.mockResolvedValue({
      software: { name: "Lotide", version: "0.7.0" },
      apiVersion: 7,
    });
    const onSelect = jest.fn();

    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Out of date/)).toHaveLength(3);
    });

    const lotideButton = screen.getByRole("button", {
      name: "Select host FBXL Lotide",
    });
    expect(lotideButton.props.accessibilityState).toEqual({
      disabled: true,
    });
    await fireEvent.press(lotideButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("selects hosts at the minimum supported API version", async () => {
    mockGetInstanceInfo.mockResolvedValue({
      software: { name: "Lotide", version: "0.8.0" },
      apiVersion: 8,
    });
    const onSelect = jest.fn();

    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getAllByText("Lotide 0.8.0")).toHaveLength(3);
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Select host FBXL Lotide" }),
    );
    expect(onSelect).toHaveBeenCalledWith("lotide.fbxl.net", "FBXL Lotide");
  });

  test("updates known host probe results by domain instead of list index", () => {
    const narwhalInfo: InstanceInfo = {
      software: { name: "Lotide", version: "0.18.1" },
      site_name: "Narwhal City",
      apiVersion: 18,
    };
    const hosts = [
      {
        name: "FBXL Lotide",
        domain: "lotide.fbxl.net",
      },
      {
        name: "Narwhal City",
        domain: "narwhal.city",
      },
    ];

    const updatedHosts = updateKnownHostInstanceInfo(
      hosts,
      "narwhal.city",
      narwhalInfo,
    );

    expect(updatedHosts[0]).toEqual(hosts[0]);
    expect(updatedHosts[1]).toEqual({
      name: "Narwhal City",
      domain: "narwhal.city",
      instanceInfo: narwhalInfo,
    });
  });

  test("submits a typed custom host from the visible continue action", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);
    const input = screen.getByPlaceholderText("Host domain");

    await waitFor(() => {
      expect(screen.getAllByText("Hoot 0.19.0")).toHaveLength(3);
    });

    await fireEvent.changeText(input, "https://LoTiDe.FBXL.NET/api/unstable");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(onSelect).toHaveBeenCalledWith("lotide.fbxl.net");
  });

  test("does not submit an empty custom host", async () => {
    const onSelect = jest.fn();
    const screen = await renderWithStore(<HostList onSelect={onSelect} />);

    await fireEvent(
      screen.getByPlaceholderText("Host domain"),
      "submitEditing",
    );

    expect(onSelect).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Enter a host",
      "Type a Lotide host domain before continuing.",
    );
  });
});

/* end of HostList.test.tsx */
