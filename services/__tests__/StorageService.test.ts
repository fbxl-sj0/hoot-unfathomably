/*
    Project: Hoot Mobile
    -------------------

    File: StorageService.test.ts

    Purpose:

        Validate defensive parsing for persisted Lotide account state.

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

import { appSettings, lotideContext, lotideContextKV } from "../StorageService";

describe("StorageService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (SecureStore as unknown as { __reset: () => void }).__reset();
  });

  test("keeps bearer tokens out of AsyncStorage and restores them from Secure Store", async () => {
    const context: LotideContext = {
      apiUrl: "https://social.example",
      login: {
        token: "sensitive-token",
        user: { id: 1, username: "alice", host: "social.example" },
      },
    };

    await lotideContext.store(context);

    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.not.toContain("sensitive-token");
    await expect(lotideContext.query()).resolves.toEqual(context);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringContaining("hoot.auth.token."), "sensitive-token");
    const secureStoreKey = (SecureStore.setItemAsync as jest.Mock).mock.calls.at(-1)?.[0] as string;
    expect(secureStoreKey).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(secureStoreKey).not.toContain("%");
  });

  test("migrates a legacy plaintext token into Secure Store on read", async () => {
    await AsyncStorage.setItem("@lotide_ctx", JSON.stringify({
      apiUrl: "https://social.example",
      login: {
        token: "legacy-token",
        user: { id: 1, username: "alice", host: "social.example" },
      },
    }));

    await expect(lotideContext.query()).resolves.toMatchObject({
      login: { token: "legacy-token" },
    });
    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.not.toContain("legacy-token");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringContaining("hoot.auth.token."), "legacy-token");
  });

  test("recovers from corrupt active context JSON", async () => {
    await AsyncStorage.setItem("@lotide_ctx", "{not json");

    await expect(lotideContext.query()).resolves.toBeUndefined();
    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.toBeNull();
  });

  test("canonicalizes active context API URLs", async () => {
    await lotideContext.store({
      apiUrl: " https://lotide.fbxl.net/api/unstable/// ",
    });

    await expect(lotideContext.query()).resolves.toEqual({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
    });
    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.toBe(
      JSON.stringify({
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      }),
    );
  });

  test("filters malformed saved account entries", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx_arr",
      JSON.stringify({
        "alice@https://lotide.fbxl.net/api/unstable": {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        "broken@https://lotide.fbxl.net/api/unstable": "not a context",
      }),
    );

    await expect(lotideContextKV.getStore()).resolves.toEqual({
      "alice@https://lotide.fbxl.net/api/unstable": {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
    });
  });

  test("canonicalizes saved account keys and contexts", async () => {
    await lotideContextKV.store({
      apiUrl: " https://lotide.fbxl.net/api/unstable/// ",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
        },
      },
    });

    await expect(lotideContextKV.listKeys()).resolves.toEqual([
      "alice@https://lotide.fbxl.net/api/unstable",
    ]);
    await expect(lotideContextKV.getStore()).resolves.toEqual({
      "alice@https://lotide.fbxl.net/api/unstable": {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "alice",
            host: "lotide.fbxl.net",
          },
        },
      },
    });
  });

  test("canonicalizes legacy saved account entries while reading them", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx_arr",
      JSON.stringify({
        "alice@https://lotide.fbxl.net/api/unstable///": {
          apiUrl: "https://lotide.fbxl.net/api/unstable///",
          login: {
            token: "token-1",
            user: {
              id: 1,
              username: "alice",
              host: "lotide.fbxl.net",
            },
          },
        },
      }),
    );

    await expect(lotideContextKV.getStore()).resolves.toEqual({
      "alice@https://lotide.fbxl.net/api/unstable": {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "alice",
            host: "lotide.fbxl.net",
          },
        },
      },
    });
    await expect(
      lotideContextKV.query("alice@https://lotide.fbxl.net/api/unstable///"),
    ).resolves.toEqual({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
        },
      },
    });
  });

  test("removes legacy saved account aliases", async () => {
    await AsyncStorage.setItem(
      "@lotide_ctx_arr",
      JSON.stringify({
        "alice@https://lotide.fbxl.net/api/unstable///": {
          apiUrl: "https://lotide.fbxl.net/api/unstable///",
          login: {
            token: "token-1",
            user: {
              id: 1,
              username: "alice",
              host: "lotide.fbxl.net",
            },
          },
        },
      }),
    );

    await expect(
      lotideContextKV.remove("alice@https://lotide.fbxl.net/api/unstable"),
    ).resolves.toEqual({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
        },
      },
    });
    await expect(lotideContextKV.getStore()).resolves.toEqual({});
    await expect(AsyncStorage.getItem("@lotide_ctx_arr")).resolves.toBe(
      JSON.stringify({}),
    );
  });

  test("continues to store accounts after a corrupt store is cleared", async () => {
    await AsyncStorage.setItem("@lotide_ctx_arr", "{not json");

    await lotideContextKV.store({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "alice",
          host: "lotide.fbxl.net",
        },
      },
    });

    await expect(lotideContextKV.listKeys()).resolves.toEqual([
      "alice@https://lotide.fbxl.net/api/unstable",
    ]);
  });

  test("loads default app settings when storage is empty", async () => {
    await expect(appSettings.query()).resolves.toEqual({
      defaultFeedSort: "hot",
    });
  });

  test("persists app settings", async () => {
    await appSettings.update({
      defaultFeedSort: "new",
    });

    await expect(appSettings.query()).resolves.toEqual({
      defaultFeedSort: "new",
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
      defaultFeedSort: "hot",
    });
  });
});

/* end of StorageService.test.ts */
