/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseCompatibilityProbe.test.ts

    Purpose:

        Verify the read-only live compatibility probe's local decisions.

    Responsibilities:

        - Cover each supported backend identity response
        - Validate the common status shape consumed by mobile cards
        - Ensure the default matrix includes Soapbox and Pleroma hosts

    This file intentionally does NOT contain:

        - Live network requests
        - Credentials
        - Public-server mutations
*/

const {
  DEFAULT_TARGETS,
  detectFamily,
  hasPleromaThemeColors,
  pleromaThemeName,
  validateStatusShape,
} = jest.requireActual("../probe-fediverse-compatibility.js") as {
  DEFAULT_TARGETS: {
    expectedFamily: string;
    label: string;
    soapbox?: boolean;
  }[];
  detectFamily: (instance: unknown) => string;
  hasPleromaThemeColors: (theme: unknown) => boolean;
  pleromaThemeName: (configuration: unknown) => string | undefined;
  validateStatusShape: (status: unknown) => string | undefined;
};

describe("Fediverse compatibility probe", () => {
  test.each([
    [
      "unfathomably",
      {
        version: "2.7.2 (compatible; unfathomably-be 3.5.0+unfathomably-be)",
        unfathomably: { backend: "unfathomably-be 3.5.0" },
      },
    ],
    [
      "rebased",
      {
        version:
          "2.7.2 (compatible; Pleroma 2.5.51-436-ge8928e22.develop+soapbox)",
      },
    ],
    ["pleroma", { version: "2.7.2 (compatible; Pleroma 2.10.2)" }],
    [
      "akkoma",
      {
        version: "2.7.2 (compatible; Akkoma 3.20.0)",
        pleroma: { metadata: { features: ["akkoma_api"] } },
      },
    ],
    ["mastodon", { version: "4.6.5" }],
  ])("detects %s metadata", (family, instance) => {
    expect(detectFamily(instance)).toBe(family);
  });

  test("accepts the status fields shared by the live matrix", () => {
    expect(validateStatusShape({
      account: { id: "account-1" },
      content: "<p>Public status</p>",
      created_at: "2026-08-13T12:00:00.000Z",
      favourites_count: 0,
      id: "status-1",
      media_attachments: [],
      mentions: [],
      reblogs_count: 0,
      replies_count: 0,
    })).toBeUndefined();
    expect(validateStatusShape({ id: "incomplete" })).toBe(
      "status.content is not a string",
    );
  });

  test("keeps known Soapbox and plain Pleroma servers in the live matrix", () => {
    expect(
      DEFAULT_TARGETS.filter(target => target.soapbox).map(target => target.label),
    ).toEqual(expect.arrayContaining([
      "Poast (Soapbox)",
      "TECI Social (Soapbox)",
    ]));
    expect(
      DEFAULT_TARGETS.filter(target => target.expectedFamily === "pleroma")
        .map(target => target.label),
    ).toEqual(expect.arrayContaining(["Pleroma/Soykaf", "Udongein"]));
  });

  test("accepts safe Pleroma FE theme presets without permitting path traversal", () => {
    expect(pleromaThemeName({
      pleroma_fe: { theme: "blueplasma" },
    })).toBe("blueplasma");
    expect(pleromaThemeName({
      pleroma_fe: { theme: "../private" },
    })).toBeUndefined();
    expect(hasPleromaThemeColors({
      source: {
        colors: {
          accent: "#e2b188",
          bg: "#0f161e",
          text: "#b9b9ba",
        },
      },
    })).toBe(true);
  });
});

/* end of FediverseCompatibilityProbe.test.ts */
