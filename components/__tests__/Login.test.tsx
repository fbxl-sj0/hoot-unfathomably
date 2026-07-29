/*
    Project: Hoot Mobile
    -------------------

    File: Login.test.tsx

    Purpose:

        Validate the Lotide credential form used by the first-run login flow.

    Responsibilities:

        - Verify login submits normalized user names
        - Verify duplicate submit attempts are blocked while a request is live
        - Verify failed requests keep the form usable

    This file intentionally does NOT contain:

        - Host picker tests
        - Native keyboard tests
        - Live Lotide authentication requests
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
const mockLogin = jest.fn();
const mockRegister = jest.fn();
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

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
}));

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
  user: {
    host: string;
    id: UserId;
    local: boolean;
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
    <Login domain="lotide.fbxl.net" onGoBack={jest.fn()} {...props} />,
  );
}

async function fillLoginForm(screen: LoginRenderResult) {
  await fireEvent.changeText(
    screen.getByPlaceholderText("Username"),
    " sj_zero ",
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
    mockLogin.mockReturnValue(login.promise);
    const screen = await renderLogin();

    await fillLoginForm(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Logging in..." })).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Logging in..." }));

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable",
      "sj_zero",
      "secret",
    );
    expect(
      screen.getByRole("button", { name: "Logging in..." }).props
        .accessibilityState,
    ).toEqual({ disabled: true });

    await act(async () => {
      login.resolve({
        token: "token-1",
        user: {
          id: 1,
          username: "sj_zero",
          host: "lotide.fbxl.net",
          local: true,
        },
      });
      await login.promise;
    });

    expect(mockLotideContextKVStore).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: expect.objectContaining({
          token: "token-1",
        }),
      }),
    );
    expect(mockLotideContextStore).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: expect.objectContaining({
          token: "token-1",
        }),
      }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lotide/setCtx",
        payload: expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
      }),
    );
  });

  test("keeps the login form usable when the server rejects credentials", async () => {
    mockLogin.mockRejectedValue(new Error("bad password"));
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
    mockLogin.mockReturnValue(login.promise);
    const screen = await renderLogin();

    await fillLoginForm(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedLogin = login.promise.then(() => undefined);
    login.resolve({
      token: "token-1",
      user: {
        id: 1,
        username: "sj_zero",
        host: "lotide.fbxl.net",
        local: true,
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
    mockLogin.mockReturnValue(login.promise);
    const screen = await renderLogin();

    await fillLoginForm(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
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

  test("trims registration usernames and email addresses", async () => {
    mockRegister.mockResolvedValue({
      token: "token-1",
      user: {
        id: 1,
        username: "sj_zero",
        host: "lotide.fbxl.net",
        local: true,
      },
    });
    const screen = await renderLogin();

    await fireEvent.press(screen.getByRole("button", {
      name: "Switch to registration",
    }));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Email Address"),
      " sj@example.com ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Username"),
      " sj_zero ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Password"),
      "secret",
    );

    await fireEvent.press(screen.getByRole("button", { name: "Register" }));

    expect(mockRegister).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable",
      "sj_zero",
      "secret",
      "sj@example.com",
    );
    await waitFor(() => {
      expect(mockLotideContextKVStore).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
          login: expect.objectContaining({
            token: "token-1",
          }),
        }),
      );
      expect(mockLotideContextStore).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
          login: expect.objectContaining({
            token: "token-1",
          }),
        }),
      );
    });
  });

  test("keeps the login form active when local login persistence fails", async () => {
    mockLogin.mockResolvedValue({
      token: "token-1",
      user: {
        id: 1,
        username: "sj_zero",
        host: "lotide.fbxl.net",
        local: true,
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
      hostName: "Lotide Test",
    });

    expect(screen.getByText("Lotide Test")).toBeTruthy();
    expect(screen.getByText("lotide.fbxl.net")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lotide Test" })).toBeNull();
    expect(screen.queryByRole("button", { name: "lotide.fbxl.net" })).toBeNull();
  });
});

/* end of Login.test.tsx */
