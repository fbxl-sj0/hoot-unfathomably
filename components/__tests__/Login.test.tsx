/*
    Project: Hoot Unfathomably
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
import {
  FEDIVERSE_SERVERS,
  makeAccount,
} from "../../testing/fediverseFixtures";

const mockDispatch = jest.fn();
const mockLoginWithAuthorizationCode = jest.fn();
const mockLoginWithPassword = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();
const mockOpenBrowserAsync = jest.fn();
const mockRegisterOAuthApplication = jest.fn();
const mockActiveAccountStore = jest.fn();
const mockAccountProfilesStore = jest.fn();

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (...args: unknown[]) =>
    mockOpenAuthSessionAsync(...args),
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock("uuid", () => ({
  v4: () => "state-123",
}));

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
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
    loginWithAuthorizationCode: (...args: unknown[]) =>
      mockLoginWithAuthorizationCode(...args),
    loginWithPassword: (...args: unknown[]) => mockLoginWithPassword(...args),
    registerOAuthApplication: (...args: unknown[]) =>
      mockRegisterOAuthApplication(...args),
  };
});

jest.mock("../../services/StorageService", () => ({
  __esModule: true,
  lotideContext: {
    store: (...args: unknown[]) => mockActiveAccountStore(...args),
  },
  lotideContextKV: {
    store: (...args: unknown[]) => mockAccountProfilesStore(...args),
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
    <Login domain="unfathomably.example" onGoBack={jest.fn()} {...props} />,
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
    mockActiveAccountStore.mockResolvedValue(undefined);
    mockAccountProfilesStore.mockResolvedValue(undefined);
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "cancel" });
    mockOpenBrowserAsync.mockResolvedValue({ type: "opened" });
    mockRegisterOAuthApplication.mockResolvedValue({
      client_id: "client-id",
      client_secret: "client-secret",
    });
    mockLoginWithAuthorizationCode.mockResolvedValue({
      token: "browser-token",
      account: {
        acct: "remote-user",
        avatar: "",
        display_name: "Remote User",
        id: "9",
        note: "",
        url: "https://pleroma.example/@remote-user",
        username: "remote-user",
      },
    });
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
      "https://unfathomably.example",
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
          url: "https://unfathomably.example/@alice",
          username: "alice",
        },
      });
      await login.promise;
    });

    expect(mockAccountProfilesStore).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://unfathomably.example",
        login: expect.objectContaining({
          token: "token-1",
        }),
      }),
    );
    expect(mockActiveAccountStore).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://unfathomably.example",
        login: expect.objectContaining({
          token: "token-1",
        }),
      }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lotide/setCtx",
        payload: expect.objectContaining({
          apiUrl: "https://unfathomably.example",
        }),
      }),
    );
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "signs in to %s through browser OAuth",
    async (_label, family) => {
      const server = FEDIVERSE_SERVERS[family];
      const account = makeAccount(family);
      mockLoginWithAuthorizationCode.mockResolvedValue({
        token: `${family}-browser-token`,
        account,
      });
      mockOpenAuthSessionAsync.mockResolvedValue({
        type: "success",
        url: "hoot://oauth/callback?code=authorization-code&state=state-123",
      });
      const screen = await renderLogin({ domain: server.origin });

      await fireEvent.press(
        screen.getByRole("button", { name: "Sign in with Server" }),
      );

      await waitFor(() => {
        expect(mockRegisterOAuthApplication).toHaveBeenCalledWith(
          server.origin,
          "hoot://oauth/callback",
        );
        expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1);
      });

      const authorizationUrl = new URL(
        mockOpenAuthSessionAsync.mock.calls[0][0],
      );
      expect(authorizationUrl.origin).toBe(server.origin);
      expect(authorizationUrl.pathname).toBe("/oauth/authorize");
      expect(authorizationUrl.searchParams.get("state")).toBe("state-123");
      expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
        authorizationUrl.toString(),
        "hoot://oauth/callback",
      );

      await waitFor(() => {
        expect(mockLoginWithAuthorizationCode).toHaveBeenCalledWith(
          server.origin,
          {
            client_id: "client-id",
            client_secret: "client-secret",
          },
          "hoot://oauth/callback",
          "authorization-code",
        );
        expect(mockAccountProfilesStore).toHaveBeenCalledWith(
          expect.objectContaining({
            apiUrl: server.origin,
            login: expect.objectContaining({
              token: `${family}-browser-token`,
            }),
          }),
        );
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              apiUrl: server.origin,
            }),
          }),
        );
      });
      expect(mockLoginWithPassword).not.toHaveBeenCalled();
    },
  );

  test("leaves the form ready when browser login is cancelled", async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "cancel" });
    const screen = await renderLogin({ domain: "rebased.example" });

    await fireEvent.press(
      screen.getByRole("button", { name: "Sign in with Server" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sign in with Server" }),
      ).toBeTruthy();
    });
    expect(mockLoginWithAuthorizationCode).not.toHaveBeenCalled();
    expect(mockAccountProfilesStore).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
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
        url: "https://unfathomably.example/@alice",
        username: "alice",
      },
    });

    await drainedLogin;
    await Promise.resolve();

    expect(mockAccountProfilesStore).not.toHaveBeenCalled();
    expect(mockActiveAccountStore).not.toHaveBeenCalled();
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
    const screen = await renderLogin({ domain: "pleroma.example" });

    await fireEvent.press(screen.getByRole("button", {
      name: "Switch to registration",
    }));

    await fireEvent.press(screen.getByRole("button", { name: "Open Server" }));

    await waitFor(() => {
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
        "https://pleroma.example",
      );
      expect(screen.getByRole("button", { name: "Open Server" })).toBeTruthy();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockLoginWithPassword).not.toHaveBeenCalled();
    expect(mockActiveAccountStore).not.toHaveBeenCalled();
  });

  test("opens password recovery on the selected server", async () => {
    const screen = await renderLogin({ domain: "rebased.example" });

    await fireEvent.press(
      screen.getByRole("button", { name: "Reset forgotten password" }),
    );

    await waitFor(() => {
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
        "https://rebased.example",
      );
    });
    expect(Alert.alert).not.toHaveBeenCalled();
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
        url: "https://unfathomably.example/@alice",
        username: "alice",
      },
    });
    mockActiveAccountStore.mockRejectedValue(new Error("storage full"));
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
    expect(screen.getByText("unfathomably.example")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unfathomably Test" })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "unfathomably.example",
      }),
    ).toBeNull();
  });
});

/* end of Login.test.tsx */
