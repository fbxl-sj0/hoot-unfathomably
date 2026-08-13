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

  test.each([
    ["feed/hot", "FeedScreen"],
    ["group-feed", "GroupFeedScreen"],
    ["groups", "SearchScreen"],
    ["new-post", "NewPostScreen"],
    ["notifications", "NotificationScreen"],
    ["options", "OptionsScreen"],
    ["people", "People"],
    ["saved", "SavedPosts"],
    ["accounts/account-1", "Account"],
    ["accounts/account-1/followers", "AccountConnections"],
    ["worlds/books/library", "BookLibrary"],
    ["worlds/routes/record", "RouteRecorder"],
  ])("maps the current '%s' destination", (path, screenName) => {
    const state = linking.getStateFromPath?.(path, linking.config);

    expect(JSON.stringify(state)).toContain(`"name":"${screenName}"`);
  });
});

/* end of LinkingConfiguration.test.ts */
