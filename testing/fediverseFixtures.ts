/*
    Project: Hoot Unfathomably
    --------------------------

    File: fediverseFixtures.ts

    Purpose:

        Provide one canonical set of release-test fixtures for the supported
        Unfathomably, Rebased, Pleroma, Akkoma, and Mastodon server families.

    Responsibilities:

        - Keep tests independent from a single public host
        - Model Mastodon-compatible accounts, statuses, groups, and notices
        - Make the server family under test explicit

    This file intentionally does NOT contain:

        - Live credentials
        - Network requests
        - Deprecated pre-Fediverse API fixtures
*/

import type {
  UnfathomablyAccount,
  UnfathomablyGroup,
  UnfathomablyInstance,
  UnfathomablyNotification,
  UnfathomablyStatus,
} from "../services/UnfathomablyService";

export type FediverseServerFamily =
  | "akkoma"
  | "mastodon"
  | "unfathomably"
  | "rebased"
  | "pleroma";

export type FediverseServerFixture = {
  family: FediverseServerFamily;
  origin: string;
  softwareName: string;
  softwareVersion: string;
  supportsGroups: boolean;
  versionResponse: string;
};

export type FediverseContext = LotideContext & {
  apiUrl: string;
  apiVersion: number;
  instanceInfo: InstanceInfo;
  login: Login;
};

export const FEDIVERSE_SERVERS: Record<
  FediverseServerFamily,
  FediverseServerFixture
> = {
  akkoma: {
    family: "akkoma",
    origin: "https://akkoma.example",
    softwareName: "Akkoma",
    softwareVersion: "3.20.0",
    supportsGroups: false,
    versionResponse: "2.7.2 (compatible; Akkoma 3.20.0)",
  },
  mastodon: {
    family: "mastodon",
    origin: "https://mastodon.example",
    softwareName: "Mastodon",
    softwareVersion: "4.6.5",
    supportsGroups: false,
    versionResponse: "4.6.5",
  },
  unfathomably: {
    family: "unfathomably",
    origin: "https://unfathomably.example",
    softwareName: "Unfathomably",
    softwareVersion: "3.5.0",
    supportsGroups: true,
    versionResponse:
      "2.7.2 (compatible; unfathomably-be 3.5.0+unfathomably-be)",
  },
  rebased: {
    family: "rebased",
    origin: "https://rebased.example",
    softwareName: "Rebased",
    softwareVersion: "3.0.0",
    supportsGroups: true,
    versionResponse:
      "2.7.2 (compatible; Pleroma 2.5.51-436-ge8928e22.develop+soapbox)",
  },
  pleroma: {
    family: "pleroma",
    origin: "https://pleroma.example",
    softwareName: "Pleroma",
    softwareVersion: "2.9.0",
    supportsGroups: false,
    versionResponse: "2.7.2 (compatible; Pleroma 2.10.2)",
  },
};

export function makeInstance(
  family: FediverseServerFamily = "unfathomably",
): UnfathomablyInstance {
  const server = FEDIVERSE_SERVERS[family];
  const featuresByFamily: Record<FediverseServerFamily, string[]> = {
    akkoma: [
      "akkoma_api",
      "custom_emoji_reactions",
      "mastodon_api",
      "pleroma_api",
      "pleroma_emoji_reactions",
      "quote_posting",
    ],
    mastodon: [],
    pleroma: [
      "mastodon_api",
      "pleroma_api",
      "pleroma_custom_emoji_reactions",
      "pleroma_emoji_reactions",
      "quote_posting",
    ],
    rebased: [
      "events",
      "mastodon_api",
      "pleroma_api",
      "pleroma_custom_emoji_reactions",
      "pleroma_emoji_reactions",
      "quote_posting",
    ],
    unfathomably: [
      "events",
      "groups",
      "groups_discovery",
      "groups_search",
      "mastodon_api",
      "notifications_v2",
      "pleroma_api",
      "pleroma_custom_emoji_reactions",
      "pleroma_dislikes",
      "pleroma_emoji_reactions",
      "quote_posting",
      "sources",
    ],
  };

  return {
    title: `${server.softwareName} Test Server`,
    version: server.versionResponse,
    pleroma: featuresByFamily[family].length > 0
      ? { metadata: { features: featuresByFamily[family] } }
      : undefined,
    unfathomably: family === "unfathomably"
      ? {
          backend: "unfathomably-be 3.5.0+unfathomably-be",
          frontend: "unfathomably-fe 3.5.0",
        }
      : undefined,
  };
}

export function makeAccount(
  family: FediverseServerFamily = "unfathomably",
  overrides: Partial<UnfathomablyAccount> = {},
): UnfathomablyAccount {
  const server = FEDIVERSE_SERVERS[family];

  return {
    id: `${family}-account-1`,
    username: "alice",
    acct: `alice@${new URL(server.origin).hostname}`,
    display_name: `${server.softwareName} Alice`,
    avatar: `${server.origin}/media/alice.png`,
    note: `<p>Testing ${server.softwareName} compatibility.</p>`,
    url: `${server.origin}/users/alice`,
    ...overrides,
  };
}

export function makeGroup(
  family: Extract<FediverseServerFamily, "unfathomably" | "rebased"> =
    "unfathomably",
  overrides: Partial<UnfathomablyGroup> = {},
): UnfathomablyGroup {
  const server = FEDIVERSE_SERVERS[family];

  return {
    id: `${family}-group-1`,
    display_name: `${server.softwareName} Test Group`,
    note: "<p>A federated group discussion.</p>",
    avatar: `${server.origin}/media/group-avatar.png`,
    header: `${server.origin}/media/group-header.png`,
    members_count: 42,
    moderators_count: 2,
    statuses_count: 180,
    locked: false,
    platform: family === "unfathomably" ? "nostr" : "activitypub",
    platform_label: family === "unfathomably" ? "Nostr community" : "ActivityPub group",
    target_kind: "group",
    target_kind_label: "Federated group",
    capabilities: ["follow", "post", "timeline"],
    relationship: {
      can_follow: true,
      can_post: true,
      federation_blocked: false,
      member: true,
      requested: false,
      role: "member",
    },
    ...overrides,
  };
}

export function makeStatus(
  family: FediverseServerFamily = "unfathomably",
  overrides: Partial<UnfathomablyStatus> = {},
): UnfathomablyStatus {
  const server = FEDIVERSE_SERVERS[family];
  const supportsGroups = server.supportsGroups;
  const supportsPleromaQuotes = family !== "mastodon";
  const supportsEmojiReactions = family !== "mastodon";
  const supportsDislikes = family === "unfathomably";

  return {
    id: `${family}-status-1`,
    created_at: "2026-07-29T12:00:00.000Z",
    content: `<p>Hello from ${server.softwareName}.</p>`,
    url: `${server.origin}/notice/${family}-status-1`,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    quote: family === "mastodon" ? null : undefined,
    quote_approval: family === "mastodon"
      ? { automatic: ["public"], current_user: "automatic", manual: [] }
      : undefined,
    quote_id: supportsPleromaQuotes ? null : undefined,
    quotes_count: 0,
    replies_count: 2,
    reblogs_count: 3,
    favourites_count: 5,
    dislikes_count: supportsDislikes ? 1 : undefined,
    favourited: false,
    disliked: supportsDislikes ? false : undefined,
    reblogged: false,
    mentions: [],
    emoji_reactions: family === "akkoma" ? [] : undefined,
    sensitive: false,
    spoiler_text: "",
    account: makeAccount(family),
    card: null,
    group: supportsGroups
      ? makeGroup(family as "unfathomably" | "rebased")
      : null,
    media_attachments: [],
    pleroma: supportsEmojiReactions && family !== "akkoma"
      ? {
          emoji_reactions: [],
          quote: null,
          quote_id: null,
          quote_visible: true,
          quotes_count: 0,
        }
      : undefined,
    ...overrides,
  };
}

export function makeDegradedStatus(
  family: Exclude<FediverseServerFamily, "unfathomably">,
  overrides: Partial<UnfathomablyStatus> = {},
): UnfathomablyStatus {
  return makeStatus(family, {
    dislikes_count: undefined,
    disliked: undefined,
    emoji_reactions: undefined,
    group: null,
    pleroma: undefined,
    quote: undefined,
    quote_approval: undefined,
    quote_id: undefined,
    quotes_count: undefined,
    ...overrides,
  });
}

export function makeNativeStatus(
  overrides: Partial<UnfathomablyStatus> = {},
): UnfathomablyStatus {
  return makeStatus("unfathomably", {
    group: null,
    pleroma: {
      native: {
        canonical_id: "https://unfathomably.example/objects/photo-1",
        class: "media",
        context: "https://www.w3.org/ns/activitystreams",
        controls: ["open", "reply", "favourite"],
        fields: {
          family: "photo",
          license: "CC BY-SA 4.0",
          location: "Lake Ontario",
          title: "Summer shoreline",
        },
        type: "https://www.w3.org/ns/activitystreams#Image",
      },
    },
    ...overrides,
  });
}

export function makeNotification(
  family: FediverseServerFamily = "pleroma",
  overrides: Partial<UnfathomablyNotification> = {},
): UnfathomablyNotification {
  return {
    id: `${family}-notification-1`,
    type: "mention",
    created_at: "2026-07-29T12:05:00.000Z",
    account: makeAccount(family),
    status: makeStatus(family),
    ...overrides,
  };
}

export function makeContext(
  family: FediverseServerFamily = "unfathomably",
): FediverseContext {
  const server = FEDIVERSE_SERVERS[family];
  const account = makeAccount(family);

  return {
    apiUrl: server.origin,
    apiVersion: 1,
    instanceInfo: {
      apiVersion: 1,
      site_name: `${server.softwareName} Test Server`,
      software: {
        name: server.softwareName,
        version: server.softwareVersion,
      },
    },
    login: {
      token: `${family}-access-token`,
      user: account as unknown as Profile,
    },
  };
}

/* end of fediverseFixtures.ts */
