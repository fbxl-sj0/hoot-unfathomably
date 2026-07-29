/*
    Project: Hoot Mobile
    -------------------

    File: Login.test.tsx

    Purpose:

        Validate the Unfathomably credential form used by the first-run login
        flow.

    Responsibilities:

        - Verify login submits normalized user names
        - Verify duplicate submit attempts are blocked while a request is live
        - Verify failed requests keep the form usable

    This file intentionally does NOT contain:

        - Host picker tests
        - Native keyboard tests
        - Live Unfathomably authentication requests
*/

import * as React from "react";
import { Alert } from "react-native";
import {
  act,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import Login from "../Login";

const mockDispatch = jest.fn();
const mockLoginWithPassword = jest.fn();
const mockLotideContextStore = jest.fn();
const mockLotideContextKVStore = jest.fn();
const mockNavigate = jest.fn();

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock("@react-navigation/core", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    tertiaryBackground: "#ddd",
    text: "#000",
    secondaryText: "#333",
    placeholderText: "#999",
    tint: "#f5a524",
    secondaryTint: "#ff9f43",
  }),
}));

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");
  return {
    __esModule: true,
    ...actual,
    loginWithPassword: (...args: unknown[]) => mockLoginWithPassword(...args),
  };
});

jest.mock("../../services/StorageService", () => ({
  __esModule: true,
  lotideContext: {
    store: (...args: unknown[]) => mockLotideContextStore(...args),
  },
  lotideContextKV: {
    store: (...args: unknown[]) => mockLotideContextKVStore(...args),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

type LoginRenderResult = Awaited<ReturnType<typeof render>>;
type LoginResponse = {
  token: string;
  account: {
    acct: string;
    avatar: string;
    display_name: string;
    id: string;
    note: string;
    url: string;
    username: string;
  };
};

function deferred<T>(): Deferred<T> {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

async function renderLogin(props: Partial<React.ComponentProps<typeof Login>> = {}) {
  return await render(
    <Login domain="social.fbxl.net" onGoBack={jest.fn()} {...props} />,
  );
}

async function fillLoginForm(screen: LoginRenderResult) {
  await fireEvent.changeText(
    screen.getByPlaceholderText("Username"),
    " alice ",
  );
  await fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
}

describe("Login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockLotideContextStore.mockResolvedValue(undefined);
    mockLotideContextKVStore.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("trims login usernames and blocks duplicate submits", async () => {
    const login = deferred<LoginResponse>();
    mockLoginWithPassword.mockReturnValue(login.promise);
    const screen = await renderLogin();

    await fillLoginForm(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Logging in..." })).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Logging in..." }));

    expect(mockLoginWithPassword).toHaveBeenCalledTimes(1);
    expect(mockLoginWithPassword).toHaveBeenCalledWith(
      "https://social.fbxl.net",
      "alice",
      "secret",
    );
    expect(
      screen.getByRole("button", { name: "Logging in..." }).props
        .accessibilityState,
    ).toEqual({ disabled: true });

    await act(async () => {
      login.resolve({
        token: "token-1",
        account: {
          acct: "alice",
          avatar: "",
          display_name: "SJ",
          id: "1",
          note: "",
          url: "https://social.fbxl.net/@alice",
          username: "alice",
        },
      });
      await login.promise;
    });

    expect(mockLotideContextKVStore).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://social.fbxl.net",
        login: expect.objectContaining({
          token: "token-1",
        }),
      }),
    );
    expect(mockLotideContextStore).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://social.fbxl.net",
        login: expect.objectContaining({
          token: "token-1",
        }),
      }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lotide/setCtx",
        payload: expect.objectContaining({
          apiUrl: "https://social.fbxl.net",
        }),
      }),
    );
  });

  test("keeps the login form usable when the server rejects credentials", async () => {
    mockLoginWithPassword.mockRejectedValue(new Error("bad password"));
    const screen = await renderLogin();

    await fillLoginForm(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Failed to login",
        "bad password",
      );
      expect(screen.getByRole("button", { name: "Login" })).toBeTruthy();
    });
  });

  test("does not activate a login that completes after leaving the form", async () => {
    const login = deferred<LoginResponse>();
    mockLoginWithPassword.mockReturnValue(login.promise);
    const screen = await renderLogin();

    await fillLoginForm(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(mockLoginWithPassword).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedLogin = login.promise.then(() => undefined);
    login.resolve({
      token: "token-1",
      account: {
        acct: "alice",
        avatar: "",
        display_name: "SJ",
        id: "1",
        note: "",
        url: "https://social.fbxl.net/@alice",
        username: "alice",
      },
    });

    await drainedLogin;
    await Promise.resolve();

    expect(mockLotideContextKVStore).not.toHaveBeenCalled();
    expect(mockLotideContextStore).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test("ignores login failures after leaving the form", async () => {
    const login = deferred<LoginResponse>();
    mockLoginWithPassword.mockReturnValue(login.promise);
    const screen = await renderLogin();

    await fillLoginForm(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(mockLoginWithPassword).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedLogin = login.promise.catch(() => undefined);
    login.reject(new Error("late login failure"));

    await drainedLogin;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Failed to login",
      "late login failure",
    );
  });

  test("directs registration to the server and restores the form", async () => {
    const screen = await renderLogin();

    await fireEvent.press(screen.getByRole("button", {
      name: "Switch to registration",
    }));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Email Address"),
      " alice@example.test ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Username"),
      " alice ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Password"),
      "secret",
    );

    await fireEvent.press(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Registration is handled by the server",
        "Open your Unfathomably server in a browser to create an account, then sign in here.",
      );
      expect(screen.getByRole("button", { name: "Register" })).toBeTruthy();
    });
    expect(mockLoginWithPassword).not.toHaveBeenCalled();
    expect(mockLotideContextStore).not.toHaveBeenCalled();
  });

  test("keeps the login form active when local login persistence fails", async () => {
    mockLoginWithPassword.mockResolvedValue({
      token: "token-1",
      account: {
        acct: "alice",
        avatar: "",
        display_name: "SJ",
        id: "1",
        note: "",
        url: "https://social.fbxl.net/@alice",
        username: "alice",
      },
    });
    mockLotideContextStore.mockRejectedValue(new Error("storage full"));
    const screen = await renderLogin();

    await fillLoginForm(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Failed to login",
        "storage full",
      );
      expect(screen.getByRole("button", { name: "Login" })).toBeTruthy();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test("renders host identity as static text instead of a fake button", async () => {
    const screen = await renderLogin({
      hostName: "Unfathomably Test",
    });

    expect(screen.getByText("Unfathomably Test")).toBeTruthy();
    expect(screen.getByText("social.fbxl.net")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unfathomably Test" })).toBeNull();
    expect(screen.queryByRole("button", { name: "social.fbxl.net" })).toBeNull();
  });
});

/* end of Login.test.tsx */
