/*
    Project: Hoot Unfathomably
    --------------------------

    File: SavedAccountService.test.ts

    Purpose:

        Verify safe account enumeration for cross-account workflows.

    Responsibilities:

        - Keep the active account first
        - Deduplicate active and saved context aliases
        - Exclude locked or malformed saved profiles
        - Resolve only explicitly selected accounts

    This file intentionally does NOT contain:

        - cross-account network mutations
        - React UI tests
        - account switching
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  getSavedAuthenticatedAccounts,
  resolveSelectedAccountContexts,
} from "../SavedAccountService";
import { lotideContextKV } from "../StorageService";
import { makeContext } from "../../testing/fediverseFixtures";

describe("SavedAccountService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (SecureStore as unknown as { __reset: () => void }).__reset();
  });

  test("returns the active account first and deduplicates its saved copy", async () => {
    const active = makeContext("unfathomably");
    const other = makeContext("pleroma");
    await lotideContextKV.store(other);
    await lotideContextKV.store(active);

    const accounts = await getSavedAuthenticatedAccounts(active);

    expect(accounts.map(account => account.key)).toEqual([
      "alice@https://unfathomably.example",
      "alice@https://pleroma.example",
    ]);
    expect(accounts.map(account => account.isActive)).toEqual([true, false]);
    expect(accounts[1].context.login?.token).toBe("pleroma-access-token");
  });

  test("excludes signed-out saved profiles and malformed users", async () => {
    const active = makeContext("mastodon");
    await AsyncStorage.setItem("@lotide_ctx_arr", JSON.stringify({
      "locked@https://pleroma.example": {
        apiUrl: "https://pleroma.example",
      },
      "broken@https://rebased.example": {
        apiUrl: "https://rebased.example",
        login: { token: "plaintext-legacy-token", user: { username: "broken" } },
      },
    }));

    await expect(getSavedAuthenticatedAccounts(active)).resolves.toHaveLength(1);
  });

  test("resolves only explicit cross-account selections", async () => {
    const active = makeContext("unfathomably");
    const pleroma = makeContext("pleroma");
    const akkoma = makeContext("akkoma");
    await lotideContextKV.store(pleroma);
    await lotideContextKV.store(akkoma);

    const selected = await resolveSelectedAccountContexts(active, [
      "alice@https://unfathomably.example",
      "alice@https://akkoma.example",
      "unknown@https://example.com",
    ]);

    expect(selected.map(account => account.key)).toEqual([
      "alice@https://unfathomably.example",
      "alice@https://akkoma.example",
    ]);
  });
});

/* end of SavedAccountService.test.ts */
