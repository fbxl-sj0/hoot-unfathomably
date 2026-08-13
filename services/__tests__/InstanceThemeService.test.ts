/*
    Project: Hoot Unfathomably
    --------------------------

    File: InstanceThemeService.test.ts

    Purpose:

        Verify server-provided frontend colors become safe native themes.

    Responsibilities:

        - Cover Soapbox, Unfathomably, Rebased, Pleroma, and Akkoma themes
        - Verify instance default modes and accessible control contrast
        - Verify public endpoint priority and offline per-host caching
        - Reject malformed and oversized configuration responses

    This file intentionally does NOT contain:

        - Live public-instance requests
        - Screenshot assertions
        - Account credentials
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  contrastRatio,
  DEFAULT_QUICK_EMOJI,
  loadCachedInstanceQuickEmoji,
  loadCachedInstanceTheme,
  normalizeInstanceQuickEmoji,
  normalizeInstanceThemeConfiguration,
  refreshInstanceQuickEmoji,
  refreshInstanceTheme,
  resolveInstanceTheme,
} from "../InstanceThemeService";

type MockResponseOptions = {
  contentLength?: string;
  ok?: boolean;
};

function mockResponse(
  body: unknown,
  options: MockResponseOptions = {},
): Response {
  return {
    headers: {
      get: () => options.contentLength ?? null,
    },
    ok: options.ok ?? true,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as Response;
}

describe("InstanceThemeService", () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  test("normalizes backend and static frontend configuration shapes", () => {
    expect(normalizeInstanceThemeConfiguration({
      soapbox_fe: {
        accentColor: "#7E0000",
        allowedEmoji: ["👍", "❤️", "👍", "", 7, "😩"],
        brandColor: "#7e0000",
        defaultSettings: { themeMode: "black" },
      },
    })).toMatchObject({
      accentColor: "#7e0000",
      brandColor: "#7e0000",
      quickEmoji: ["👍", "❤️", "😩"],
      themeMode: "black",
    });

    expect(normalizeInstanceThemeConfiguration({
      brandColor: "#173",
      defaultSettings: { themeMode: "light" },
    })).toMatchObject({
      accentColor: "#117733",
      brandColor: "#117733",
      themeMode: "light",
    });

    expect(normalizeInstanceThemeConfiguration({
      pleroma_fe: { theme: "pleroma-dark" },
    })).toBeUndefined();
    expect(normalizeInstanceThemeConfiguration({
      _pleroma_theme_version: 2,
      source: {
        colors: {
          accent: "#e2b188",
          bg: "#0f161e",
          cGreen: "#5dc94a",
          cRed: "#d31014",
          fg: "#151e2b",
          link: "#81beea",
          text: "#b9b9ba",
        },
      },
    })).toMatchObject({
      accentColor: "#81beea",
      backgroundColor: "#0f161e",
      brandColor: "#e2b188",
      secondaryBackgroundColor: "#151e2b",
      textColor: "#b9b9ba",
      themeMode: "dark",
    });
    expect(normalizeInstanceThemeConfiguration({
      brandColor: "javascript:alert(1)",
    })).toBeUndefined();

    expect(normalizeInstanceQuickEmoji({
      unfathomably_fe: {
        allowedEmoji: ["👍", "", "👍", "🤔", "x".repeat(65), null],
      },
    })).toEqual(["👍", "🤔"]);
  });

  test("uses the current Unfathomably FE quick-reaction default", () => {
    expect(DEFAULT_QUICK_EMOJI).toEqual([
      "👍",
      "❤️",
      "🤔",
      "😆",
      "😮",
      "😡",
      "😢",
      "😏",
      "🇫",
    ]);
  });

  test("uses a server's light, dark, and black defaults", () => {
    const lightConfiguration = normalizeInstanceThemeConfiguration({
      brandColor: "#167a3c",
      defaultSettings: { themeMode: "light" },
    });
    const darkConfiguration = normalizeInstanceThemeConfiguration({
      brandColor: "#457d7b",
      colors: {
        primary: { "800": "#0d2828", "900": "#081110" },
        gray: { "100": "#d3e7e7", "200": "#f3f3f3" },
      },
      defaultSettings: { themeMode: "dark" },
    });
    const blackConfiguration = normalizeInstanceThemeConfiguration({
      brandColor: "#7e0000",
      colors: {
        primary: { "300": "#a54d4d", "800": "#410101", "900": "#000000" },
      },
      defaultSettings: { themeMode: "black" },
    });

    const light = resolveInstanceTheme(lightConfiguration, "dark");
    const dark = resolveInstanceTheme(darkConfiguration, "light");
    const black = resolveInstanceTheme(blackConfiguration, "light");

    expect(light.colorScheme).toBe("light");
    expect(light.colors.background).toBe("#ffffff");
    expect(light.colors.tint).not.toBe("#7e0000");
    expect(dark.colorScheme).toBe("dark");
    expect(dark.colors.background).toBe("#081110");
    expect(black.colorScheme).toBe("dark");
    expect(black.colors.background).toBe("#000000");
    expect(black.colors.secondaryBackground).toBe("#410101");

    for (const theme of [light, dark, black]) {
      expect(
        contrastRatio(theme.colors.tint, theme.colors.onTint),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.background, theme.colors.text),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.background, theme.colors.secondaryText),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("prefers backend configuration and caches it by normalized origin", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(
      async request => {
        const url = String(request);
        if (url.endsWith("/api/pleroma/frontend_configurations")) {
          return mockResponse({
            soapbox_fe: {
              brandColor: "#167a3c",
              defaultSettings: { themeMode: "light" },
            },
          });
        }

        return mockResponse({
          allowedEmoji: ["👍", "❤️", "😩"],
          brandColor: "#7e0000",
          defaultSettings: { themeMode: "black" },
        });
      },
    );

    const refreshed = await refreshInstanceTheme(
      "https://themes.example/some/backend/path/",
    );

    expect(refreshed).toMatchObject({
      brandColor: "#167a3c",
      quickEmoji: ["👍", "❤️", "😩"],
      themeMode: "light",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://themes.example/api/pleroma/frontend_configurations",
      "https://themes.example/api/v1/pleroma/frontend_configurations",
      "https://themes.example/instance/soapbox.json",
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        headers: { Accept: "application/json" },
      });
      expect((options?.headers as Record<string, string>).Authorization)
        .toBeUndefined();
    }
    await expect(
      loadCachedInstanceTheme("https://themes.example"),
    ).resolves.toMatchObject({
      brandColor: "#167a3c",
      quickEmoji: ["👍", "❤️", "😩"],
      themeMode: "light",
    });
    await expect(
      loadCachedInstanceQuickEmoji("https://themes.example"),
    ).resolves.toEqual(["👍", "❤️", "😩"]);
  });

  test("caches allowedEmoji without requiring usable theme colors", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(
      async request => String(request).endsWith(
        "/api/pleroma/frontend_configurations",
      )
        ? mockResponse({
            soapbox_fe: {
              allowedEmoji: ["👍", "❤️", "🤔", "😆"],
            },
          })
        : mockResponse({}),
    );

    const [theme, quickEmoji] = await Promise.all([
      refreshInstanceTheme("https://reactions.example"),
      refreshInstanceQuickEmoji("https://reactions.example"),
    ]);

    expect(theme).toBeUndefined();
    expect(quickEmoji).toEqual(["👍", "❤️", "🤔", "😆"]);
    await expect(
      loadCachedInstanceQuickEmoji("https://reactions.example"),
    ).resolves.toEqual(["👍", "❤️", "🤔", "😆"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("loads the Pleroma FE default theme preset from its public static path", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(
      async request => {
        const url = String(request);
        if (url.endsWith("/api/pleroma/frontend_configurations")) {
          return mockResponse({ pleroma_fe: { theme: "blueplasma" } });
        }
        if (url.endsWith("/static/themes/blueplasma.json")) {
          return mockResponse({
            _pleroma_theme_version: 2,
            theme: {
              colors: {
                accent: "#713dda",
                bg: "#110727",
                cGreen: "#0fa00f",
                cRed: "#d31014",
                fg: "#20113f",
                link: "#5926c2",
                text: "#b9b9ba",
              },
            },
          });
        }

        return mockResponse({}, { ok: false });
      },
    );

    const refreshed = await refreshInstanceTheme("https://akkoma.example");
    const resolved = resolveInstanceTheme(refreshed, "light");

    expect(refreshed).toMatchObject({
      backgroundColor: "#110727",
      brandColor: "#713dda",
      secondaryBackgroundColor: "#20113f",
      themeMode: "dark",
    });
    expect(resolved).toMatchObject({
      colorScheme: "dark",
      colors: {
        background: "#110727",
        secondaryBackground: "#20113f",
        text: "#b9b9ba",
      },
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "https://akkoma.example/static/themes/blueplasma.json",
    );
  });

  test("does not request an unsafe Pleroma theme path", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(
      async request => {
        if (String(request).endsWith("/api/pleroma/frontend_configurations")) {
          return mockResponse({ pleroma_fe: { theme: "../private" } });
        }
        return mockResponse({}, { ok: false });
      },
    );

    await expect(
      refreshInstanceTheme("https://themes.example"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("ignores oversized responses and falls back without throwing", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      mockResponse("{}", { contentLength: String((256 * 1024) + 1) }),
    );

    await expect(
      refreshInstanceTheme("https://oversized.example"),
    ).resolves.toBeUndefined();
    await expect(
      loadCachedInstanceTheme("https://oversized.example"),
    ).resolves.toBeUndefined();
  });
});

/* end of InstanceThemeService.test.ts */
