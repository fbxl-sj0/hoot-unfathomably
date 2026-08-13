/*
    Project: Hoot Unfathomably
    --------------------------

    File: useI18n.test.ts

    Purpose:

        Verify complete locale selection and safe message interpolation.

    Responsibilities:

        - Cover primary navigation and composing in every bundled locale
        - Verify named values are inserted without changing surrounding text
        - Confirm unsupported device languages fall back to English

    This file intentionally does NOT contain:

        - component rendering assertions
        - server-side post translation tests
        - persisted settings behavior
*/

import { getLocales } from "expo-localization";

import { translate } from "../useI18n";

describe("application localization", () => {
  test.each([
    ["en", "Timeline", "Publish"],
    ["fr", "Fil d’actualité", "Publier"],
    ["es", "Cronología", "Publicar"],
  ] as const)(
    "translates navigation and composing in %s",
    (locale, nav, compose) => {
      expect(translate(locale, "nav.timeline")).toBe(nav);
      expect(translate(locale, "compose.publish")).toBe(compose);
    },
  );

  test("interpolates localized values", () => {
    expect(translate("fr", "compose.publishAccounts", { count: 3 })).toBe(
      "Publier sur 3 comptes",
    );
    expect(
      translate("es", "compose.attachmentDescription", { number: 2 }),
    ).toBe("Descripción del archivo adjunto 2");
  });

  test("falls back to English for an unsupported system language", () => {
    jest.mocked(getLocales).mockReturnValueOnce([
      {
        languageCode: "de",
        languageTag: "de-DE",
      },
    ] as unknown as ReturnType<typeof getLocales>);

    expect(translate("system", "actions.translatePost")).toBe("Translate post");
  });
});

/* end of useI18n.test.ts */
