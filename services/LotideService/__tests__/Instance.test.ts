/*
    Project: Hoot Mobile
    -------------------

    File: Instance.test.ts

    Purpose:

        Validate Lotide instance metadata normalization.

    Responsibilities:

        • Verify hitide software version strings produce API version numbers
        • Verify malformed optional content is normalized safely
        • Verify missing instance metadata falls back safely

    This file intentionally does NOT contain:

        • UI feature-gating tests
        • Live network integration tests against a Lotide node
        • Authentication tests
*/

import { getInstanceInfo, parseApiVersion } from "../Instance";

const ctx = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
};

describe("Instance service", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        description: {
          content_text: "Lotide instance",
          content_markdown: null,
          content_html: null,
        },
        software: {
          name: "lotide",
          version: "0.17.0-FBXL",
        },
        signup_allowed: true,
        invitations_enabled: false,
        community_creation_requirement: null,
        invitation_creation_requirement: null,
        web_push_vapid_key: "",
      }),
    });
  });

  test("parses hitide-style software versions", () => {
    expect(parseApiVersion("0.17.0-FBXL")).toBe(17);
    expect(parseApiVersion("1.2.3")).toBe(2);
    expect(parseApiVersion("not a version")).toBe(0);
  });

  test("loads and normalizes instance metadata", async () => {
    const instance = await getInstanceInfo(ctx);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/instance",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(instance).toEqual(
      expect.objectContaining({
        apiVersion: 17,
        description: {
          content_text: "Lotide instance",
          content_markdown: null,
          content_html: null,
        },
        software: expect.objectContaining({
          name: "lotide",
          version: "0.17.0-FBXL",
        }),
      }),
    );
  });

  test("normalizes malformed optional instance fields", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        description: 42,
        software: {
          version: "broken",
        },
      }),
    });

    const instance = await getInstanceInfo(ctx);

    expect(instance).toEqual(
      expect.objectContaining({
        apiVersion: 0,
        description: {
          content_text: "",
          content_markdown: null,
          content_html: null,
        },
        software: expect.objectContaining({
          name: "unknown",
          version: "broken",
        }),
      }),
    );
  });

  test("falls back when instance metadata omits software fields", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        description: null,
        software: {
          name: "lotide",
        },
      }),
    });

    await expect(getInstanceInfo(ctx)).resolves.toEqual(
      expect.objectContaining({
        apiVersion: 0,
        software: expect.objectContaining({
          name: "lotide",
          version: "unknown",
        }),
        site_name: "lotide",
      }),
    );
  });
});

/* end of Instance.test.ts */
