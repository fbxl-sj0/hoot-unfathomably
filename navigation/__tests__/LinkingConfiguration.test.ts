/*
    Project: Hoot Unfathomably
    --------------------------

    File: LinkingConfiguration.test.ts

    Purpose:

        Protect browser OAuth callbacks from navigation route handling.

    Responsibilities:

        • Leave OAuth callback links for Expo WebBrowser
        • Continue parsing ordinary application deep links

    This file intentionally does NOT contain:

        • Browser authentication tests
        • Screen navigation rendering
*/

import linking, {
  isOAuthCallbackPath,
} from "../LinkingConfiguration";

describe("LinkingConfiguration", () => {
  test("recognizes OAuth callbacks with query parameters", () => {
    expect(
      isOAuthCallbackPath(
        "/oauth/callback?code=code-1&state=state-1",
      ),
    ).toBe(true);
    expect(isOAuthCallbackPath("status/123")).toBe(false);
  });

  test("leaves OAuth callbacks to the active browser auth session", () => {
    expect(
      linking.getStateFromPath?.(
        "oauth/callback?code=code-1&state=state-1",
        linking.config,
      ),
    ).toBeUndefined();
  });

  test("continues parsing normal app links", () => {
    expect(
      linking.getStateFromPath?.("status/123", linking.config),
    ).toEqual(
      expect.objectContaining({
        routes: expect.arrayContaining([
          expect.objectContaining({ name: "Status" }),
        ]),
      }),
    );
  });
});

/* end of LinkingConfiguration.test.ts */
