/*
    Project: Hoot Mobile
    -------------------

    File: util.test.ts

    Purpose:

        Validate low-level Lotide request utility behavior.

    Responsibilities:

        • Verify invalid JSON is reported with a friendly error
        • Verify stalled requests time out
        • Verify HTTP errors retain status and response body metadata
        • Verify authenticated endpoints fail before issuing bad requests

    This file intentionally does NOT contain:

        • Endpoint-specific tests
        • React component tests
        • Live network integration tests
*/

import {
  isAuthenticationError,
  LOTIDE_REQUEST_TIMEOUT_MS,
  lotideRequest,
  normalizeLotideApiUrl,
  readJson,
} from "../util";

describe("Lotide service utilities", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("turns invalid JSON into a friendly error", async () => {
    await expect(
      readJson({
        json: jest.fn().mockRejectedValue(new Error("bad json")),
      } as unknown as Parameters<typeof readJson>[0]),
    ).rejects.toThrow("The Lotide server returned invalid JSON.");
  });

  test("sends JSON bodies with bearer authentication", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 7 }),
    });

    await lotideRequest(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: { token: "token-1" },
      },
      "POST",
      "posts",
      {
        title: "Lotide post",
      },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/posts",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Lotide post",
        }),
      }),
    );
  });

  test("normalizes trailing API slashes before making requests", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 7 }),
    });

    await lotideRequest(
      {
        apiUrl: " https://lotide.fbxl.net/api/unstable/// ",
      },
      "GET",
      "/instance",
      undefined,
      true,
    );

    expect(normalizeLotideApiUrl(
      " https://lotide.fbxl.net/api/unstable/// ",
    )).toBe("https://lotide.fbxl.net/api/unstable");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/instance",
      expect.objectContaining({
        method: "GET",
      }),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue("temporarily unavailable"),
    });

    await expect(
      lotideRequest(
        {
          apiUrl: " https://lotide.fbxl.net/api/unstable/// ",
        },
        "GET",
        "/instance",
        undefined,
        true,
      ),
    ).rejects.toMatchObject({
      body: "temporarily unavailable",
      path: "https://lotide.fbxl.net/api/unstable/instance",
      status: 503,
    });
  });

  test("clears request timeouts after completed requests", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 7 }),
    });

    await lotideRequest(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
      "GET",
      "instance",
      undefined,
      true,
    );

    expect(jest.getTimerCount()).toBe(0);
  });

  test("times out stalled Lotide requests", async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;

    global.fetch = jest.fn((_url, options?: RequestInit) => {
      requestSignal = options?.signal;
      return new Promise<Response>(() => {});
    });

    const request = lotideRequest(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
      "GET",
      "instance",
      undefined,
      true,
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(LOTIDE_REQUEST_TIMEOUT_MS);

    await expect(request).rejects.toMatchObject({
      message: "The Lotide server did not respond within 30 seconds.",
      method: "GET",
      path: "https://lotide.fbxl.net/api/unstable/instance",
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("keeps HTTP error status and body metadata", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue("server exploded"),
    });

    await expect(
      lotideRequest(
        {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        "GET",
        "instance",
        undefined,
        true,
      ),
    ).rejects.toMatchObject({
      status: 500,
      body: "server exploded",
      method: "GET",
      path: "https://lotide.fbxl.net/api/unstable/instance",
    });
  });

  test("identifies authentication failures by HTTP status", () => {
    const unauthorized = new Error("unauthorized") as Error & { status: number };
    unauthorized.status = 401;

    const forbidden = new Error("forbidden") as Error & { status: number };
    forbidden.status = 403;

    const serverError = new Error("server exploded") as Error & { status: number };
    serverError.status = 500;

    expect(isAuthenticationError(unauthorized)).toBe(true);
    expect(isAuthenticationError(forbidden)).toBe(true);
    expect(isAuthenticationError(serverError)).toBe(false);
    expect(isAuthenticationError(new Error("offline"))).toBe(false);
  });

  test("does not issue authenticated requests without a login", async () => {
    global.fetch = jest.fn();

    await expect(
      lotideRequest(
        {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        "GET",
        "users/~me/notifications",
      ),
    ).rejects.toThrow("Not logged in");

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* end of util.test.ts */
