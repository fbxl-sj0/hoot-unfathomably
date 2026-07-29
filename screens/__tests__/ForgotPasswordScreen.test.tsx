/*
    Project: Hoot Mobile
    -------------------

    File: ForgotPasswordScreen.test.tsx

    Purpose:

        Validate the Lotide password reset screen.

    Responsibilities:

        - Verify reset-key requests use trimmed email input
        - Verify rejected reset keys show a recoverable message
        - Verify accepted reset keys allow password reset and navigation

    This file intentionally does NOT contain:

        - Live Lotide password reset requests
        - Native keyboard behavior tests
        - Login persistence tests
*/

import * as React from "react";
import { Alert } from "react-native";
import {
  act,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import ForgotPasswordScreen from "../ForgotPasswordScreen";

const mockForgotPasswordRequestKey = jest.fn();
const mockForgotPasswordTestKey = jest.fn();
const mockForgotPasswordReset = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    placeholderText: "#999",
    red: "#f00",
    secondaryBackground: "#eee",
    secondaryText: "#333",
    secondaryTint: "#ff9f43",
    tertiaryBackground: "#ddd",
    text: "#000",
    tint: "#f5a524",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  forgotPasswordRequestKey: (...args: unknown[]) =>
    mockForgotPasswordRequestKey(...args),
  forgotPasswordReset: (...args: unknown[]) =>
    mockForgotPasswordReset(...args),
  forgotPasswordTestKey: (...args: unknown[]) =>
    mockForgotPasswordTestKey(...args),
}));

async function renderForgotPasswordScreen() {
  const navigation = {
    popToTop: jest.fn(),
  };

  return {
    navigation,
    screen: await render(
      <ForgotPasswordScreen
        navigation={navigation as never}
        route={
          {
            key: "forgot-password",
            name: "ForgotPassword",
            params: {
              node: "lotide.fbxl.net",
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
  await act(async () => {
    fireEvent.changeText(element, value);
    await flushAsyncState();
  });
}

async function pressAndFlush(
  element: ReturnType<Awaited<ReturnType<typeof render>>["getByRole"]>,
) {
  await act(async () => {
    fireEvent.press(element);
    await flushAsyncState();
  });
}

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

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockForgotPasswordRequestKey.mockResolvedValue(undefined);
    mockForgotPasswordTestKey.mockResolvedValue(undefined);
    mockForgotPasswordReset.mockResolvedValue(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("requests a reset key with a trimmed email address", async () => {
    const { screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(
      screen.getByLabelText("Email address"),
      "  sj_zero@example.com  ",
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Email address").props.value).toBe(
        "  sj_zero@example.com  ",
      );
    });
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(mockForgotPasswordRequestKey).toHaveBeenCalledWith(
        {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        "sj_zero@example.com",
      );
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
    });
  });

  test("shows a recoverable message when a reset key is rejected", async () => {
    mockForgotPasswordTestKey.mockRejectedValue(new Error("invalid key"));
    const { screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await waitFor(() => {
      expect(screen.getByLabelText("Email address").props.value).toBe("a@b.test");
    });
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
    });

    await changeTextAndFlush(screen.getByLabelText("Reset key"), "bad-key");

    await waitFor(() => {
      expect(mockForgotPasswordTestKey).toHaveBeenCalledWith(
        {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        "bad-key",
      );
      expect(screen.getByText("This reset key was not accepted.")).toBeTruthy();
      expect(screen.queryByLabelText("New password")).toBeNull();
    });
  });

  test("disables reset-key requests while one is pending", async () => {
    const deferred = createDeferred<void>();
    mockForgotPasswordRequestKey.mockReturnValue(deferred.promise);
    const { screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    expect(mockForgotPasswordRequestKey).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Sending..." }).props
        .accessibilityState.disabled,
    ).toBe(true);

    await act(async () => {
      deferred.resolve(undefined);
      await flushAsyncState();
    });

    expect(mockForgotPasswordRequestKey).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
    });
  });

  test("resets the password after a valid reset key is accepted", async () => {
    const { navigation, screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await waitFor(() => {
      expect(screen.getByLabelText("Email address").props.value).toBe("a@b.test");
    });
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
    });

    await changeTextAndFlush(
      screen.getByLabelText("Reset key"),
      "  good-key  ",
    );

    await waitFor(() => {
      expect(screen.getByLabelText("New password")).toBeTruthy();
    });

    await changeTextAndFlush(
      screen.getByLabelText("New password"),
      "new password",
    );
    await waitFor(() => {
      expect(screen.getByLabelText("New password").props.value).toBe(
        "new password",
      );
    });
    await pressAndFlush(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
      expect(mockForgotPasswordReset).toHaveBeenCalledWith(
        {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        "good-key",
        "new password",
      );
      expect(navigation.popToTop).toHaveBeenCalledTimes(1);
    });
  });

  test("clears an accepted reset key when changing email", async () => {
    const { screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
    });

    await changeTextAndFlush(screen.getByLabelText("Reset key"), "good-key");

    await waitFor(() => {
      expect(screen.getByLabelText("New password")).toBeTruthy();
    });

    await pressAndFlush(screen.getByRole("button", { name: "Change Email" }));
    await changeTextAndFlush(
      screen.getByLabelText("Email address"),
      "other@example.com",
    );
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
      expect(screen.queryByLabelText("New password")).toBeNull();
    });
  });

  test("shows a friendly alert when the reset key request fails", async () => {
    mockForgotPasswordRequestKey.mockRejectedValue(new Error("mail offline"));
    const { screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await waitFor(() => {
      expect(screen.getByLabelText("Email address").props.value).toBe("a@b.test");
    });
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Failed to send reset key",
        "mail offline",
      );
      expect(screen.queryByLabelText("Reset key")).toBeNull();
    });
  });

  test("ignores reset-key request failures after leaving the screen", async () => {
    const requestKey = createDeferred<void>();
    mockForgotPasswordRequestKey.mockReturnValue(requestKey.promise);
    const { screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(mockForgotPasswordRequestKey).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedRequest = requestKey.promise.catch(() => undefined);
    requestKey.reject(new Error("late mail failure"));

    await drainedRequest;
    await flushAsyncState();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Failed to send reset key",
      "late mail failure",
    );
  });

  test("ignores password reset success after leaving the screen", async () => {
    const resetPassword = createDeferred<void>();
    mockForgotPasswordReset.mockReturnValue(resetPassword.promise);
    const { navigation, screen } = await renderForgotPasswordScreen();

    await changeTextAndFlush(screen.getByLabelText("Email address"), "a@b.test");
    await pressAndFlush(screen.getByRole("button", { name: "Send Reset Key" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Reset key")).toBeTruthy();
    });

    await changeTextAndFlush(screen.getByLabelText("Reset key"), "good-key");

    await waitFor(() => {
      expect(screen.getByLabelText("New password")).toBeTruthy();
    });

    await changeTextAndFlush(
      screen.getByLabelText("New password"),
      "new password",
    );
    await pressAndFlush(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() => {
      expect(mockForgotPasswordReset).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedReset = resetPassword.promise.then(() => undefined);
    resetPassword.resolve(undefined);

    await drainedReset;
    await flushAsyncState();

    expect(navigation.popToTop).not.toHaveBeenCalled();
  });
});

/* end of ForgotPasswordScreen.test.tsx */
