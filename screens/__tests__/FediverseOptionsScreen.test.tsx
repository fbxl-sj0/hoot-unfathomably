/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseOptionsScreen.test.tsx

    Purpose:

        Verify account options against each supported server family.

    Responsibilities:

        - Render every supported Fediverse account identity.
        - Open the current account profile and application settings.

    This file intentionally does NOT contain:

        - Server requests.
        - Account mutation tests.
        - Live account data.
*/

import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import OptionsScreen from "../OptionsScreen";
import { makeContext } from "../../testing/fediverseFixtures";

let mockCurrentContext: LotideContext | undefined;

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    secondaryBackground: "#eee",
    secondaryText: "#555",
    text: "#111",
  }),
}));

describe("Fediverse account options", () => {
  test.each([
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "opens profile and settings from a %s account",
    async (softwareName, family) => {
      mockCurrentContext = makeContext(family);
      const navigation = { navigate: jest.fn() };
      const screen = await render(
        <OptionsScreen navigation={navigation} />,
      );

      expect(screen.getByText(`${softwareName} Alice`)).toBeTruthy();
      expect(
        screen.getByText(`@alice@${family}.example`),
      ).toBeTruthy();

      await fireEvent.press(
        screen.getByRole("button", {
          name: "Open your profile and posts",
        }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("AccountProfile");

      await fireEvent.press(
        screen.getByRole("button", {
          name: "Find people and manage follow requests",
        }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("People");

      await fireEvent.press(
        screen.getByRole("button", { name: "Open saved posts" }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("SavedPosts");

      await fireEvent.press(
        screen.getByRole("button", { name: "Open app settings" }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Settings");
    },
  );
});

/* end of FediverseOptionsScreen.test.tsx */
