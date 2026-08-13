/*
    Project: Hoot Unfathomably
    -------------------

    File: StorageService.test.ts

    Purpose:

        Validate defensive parsing for persisted Fediverse account state.

    Responsibilities:

        - Verify corrupt active context storage recovers safely
        - Verify saved account storage ignores malformed entries
        - Verify account storage remains usable after recovery

    This file intentionally does NOT contain:

        - React component tests
        - AsyncStorage native integration tests
        - network request tests
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  appSettings,
  lotideContext as accountContext,
  lotideContextKV as accountProfiles,
} from "../StorageService";
import { makeContext } from "../../testing/fediverseFixtures";

describe("StorageService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (SecureStore as unknown as { __reset: () => void }).__reset();
  });

  test.each([
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "keeps %s bearer tokens out of AsyncStorage",
    async (_label, family) => {
      const context = makeContext(family);

      await accountContext.store(context);

      await expect(
        AsyncStorage.getItem("@lotide_ctx"),
      ).resolves.not.toContain(`${family}-access-token`);
      await expect(accountContext.query()).resolves.toEqual(context);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        expect.stringContaining("hoot.auth.token."),
        `${family}-access-token`,
      );
      const secureStoreKey = (
        SecureStore.setItemAsync as jest.Mock
      ).mock.calls.at(-1)?.[0] as string;
      expect(secureStoreKey).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(secureStoreKey).not.toContain("%");
    },
  );

  test("migrates a legacy plaintext token into Secure Store on read", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx",
      JSON.stringify({
        apiUrl: "https://pleroma.example",
        login: {
          token: "legacy-token",
          user: { id: 1, username: "alice", host: "pleroma.example" },
        },
      }),
    );

    await expect(accountContext.query()).resolves.toMatchObject({
      login: { token: "legacy-token" },
    });
    await expect(
      AsyncStorage.getItem("@lotide_ctx"),
    ).resolves.not.toContain("legacy-token");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringContaining("hoot.auth.token."),
      "legacy-token",
    );
  });

  test("recovers from corrupt active context JSON", async () => {
    await AsyncStorage.setItem("@lotide_ctx", "{not json");

    await expect(accountContext.query()).resolves.toBeUndefined();
    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.toBeNull();
  });

  test("canonicalizes active context API URLs", async () => {
    await accountContext.store({
      apiUrl: " https://unfathomably.example/// ",
    });

    await expect(accountContext.query()).resolves.toEqual({
      apiUrl: "https://unfathomably.example",
    });
    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.toBe(
      JSON.stringify({
        apiUrl: "https://unfathomably.example",
      }),
    );
  });

  test("filters malformed saved account entries", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx_arr",
      JSON.stringify({
        "alice@https://unfathomably.example": {
          apiUrl: "https://unfathomably.example",
        },
        "broken@https://unfathomably.example": "not a context",
      }),
    );

    await expect(accountProfiles.getStore()).resolves.toEqual({
      "alice@https://unfathomably.example": {
        apiUrl: "https://unfathomably.example",
      },
    });
  });

  test("canonicalizes saved account keys and contexts", async () => {
    await accountProfiles.store({
      apiUrl: " https://unfathomably.example/// ",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "unfathomably.example",
        },
      },
    });

    await expect(accountProfiles.listKeys()).resolves.toEqual([
      "alice@https://unfathomably.example",
    ]);
    await expect(accountProfiles.getStore()).resolves.toEqual({
      "alice@https://unfathomably.example": {
        apiUrl: "https://unfathomably.example",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "alice",
            host: "unfathomably.example",
          },
        },
      },
    });
  });

  test("canonicalizes legacy saved account entries while reading them", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx_arr",
      JSON.stringify({
        "alice@https://unfathomably.example///": {
          apiUrl: "https://unfathomably.example///",
          login: {
            token: "token-1",
            user: {
              id: 1,
              username: "alice",
              host: "unfathomably.example",
            },
          },
        },
      }),
    );

    await expect(accountProfiles.getStore()).resolves.toEqual({
      "alice@https://unfathomably.example": {
        apiUrl: "https://unfathomably.example",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "alice",
            host: "unfathomably.example",
          },
        },
      },
    });
    await expect(
      accountProfiles.query("alice@https://unfathomably.example///"),
    ).resolves.toEqual({
      apiUrl: "https://unfathomably.example",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "unfathomably.example",
        },
      },
    });
  });

  test("removes legacy saved account aliases", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx_arr",
      JSON.stringify({
        "alice@https://unfathomably.example///": {
          apiUrl: "https://unfathomably.example///",
          login: {
            token: "token-1",
            user: {
              id: 1,
              username: "alice",
              host: "unfathomably.example",
            },
          },
        },
      }),
    );

    await expect(
      accountProfiles.remove("alice@https://unfathomably.example"),
    ).resolves.toEqual({
      apiUrl: "https://unfathomably.example",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "unfathomably.example",
        },
      },
    });
    await expect(accountProfiles.getStore()).resolves.toEqual({});
    await expect(AsyncStorage.getItem("@lotide_ctx_arr")).resolves.toBe(
      JSON.stringify({}),
    );
  });

  test("continues to store accounts after a corrupt store is cleared", async () => {
    await AsyncStorage.setItem("@lotide_ctx_arr", "{not json");

    await accountProfiles.store({
      apiUrl: "https://unfathomably.example",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "unfathomably.example",
        },
      },
    });

    await expect(accountProfiles.listKeys()).resolves.toEqual([
      "alice@https://unfathomably.example",
    ]);
  });

  test("loads default app settings when storage is empty", async () => {
    await expect(appSettings.query()).resolves.toEqual({
      alwaysExpandContentWarnings: false,
      defaultFeedSort: "hot",
      highContrast: false,
      locale: "system",
      reduceMotion: false,
      showMediaDescriptions: false,
      textScale: 1,
    });
  });

  test("persists app settings", async () => {
    await appSettings.update({
      defaultFeedSort: "new",
    });

    await expect(appSettings.query()).resolves.toEqual({
      alwaysExpandContentWarnings: false,
      defaultFeedSort: "new",
      highContrast: false,
      locale: "system",
      reduceMotion: false,
      showMediaDescriptions: false,
      textScale: 1,
    });
  });

  test("repairs malformed app settings", async () => {
    await AsyncStorage.setItem(
      "@hoot_app_settings",
      JSON.stringify({
        defaultFeedSort: "sideways",
      }),
    );

    await expect(appSettings.query()).resolves.toEqual({
      alwaysExpandContentWarnings: false,
      defaultFeedSort: "hot",
      highContrast: false,
      locale: "system",
      reduceMotion: false,
      showMediaDescriptions: false,
      textScale: 1,
    });
  });
});

/* end of StorageService.test.ts */
