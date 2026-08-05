/*
    Project: Hoot Unfathomably
    --------------------------

    File: fediverseFixtures.ts

    Purpose:

        Provide one canonical set of release-test fixtures for the supported
        Unfathomably, Rebased, and Pleroma server families.

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
  UnfathomablyNotification,
  UnfathomablyStatus,
} from "../services/UnfathomablyService";

export type FediverseServerFamily =
  | "unfathomably"
  | "rebased"
  | "pleroma";

export type FediverseServerFixture = {
  family: FediverseServerFamily;
  origin: string;
  softwareName: string;
  softwareVersion: string;
  supportsGroups: boolean;
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
  unfathomably: {
    family: "unfathomably",
    origin: "https://unfathomably.example",
    softwareName: "Unfathomably",
    softwareVersion: "2.0.0",
    supportsGroups: true,
  },
  rebased: {
    family: "rebased",
    origin: "https://rebased.example",
    softwareName: "Rebased",
    softwareVersion: "3.0.0",
    supportsGroups: true,
  },
  pleroma: {
    family: "pleroma",
    origin: "https://pleroma.example",
    softwareName: "Pleroma",
    softwareVersion: "2.9.0",
    supportsGroups: false,
  },
};

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
    locked: false,
    relationship: { member: true, requested: false },
    ...overrides,
  };
}

export function makeStatus(
  family: FediverseServerFamily = "unfathomably",
  overrides: Partial<UnfathomablyStatus> = {},
): UnfathomablyStatus {
  const server = FEDIVERSE_SERVERS[family];

  return {
    id: `${family}-status-1`,
    created_at: "2026-07-29T12:00:00.000Z",
    content: `<p>Hello from ${server.softwareName}.</p>`,
    url: `${server.origin}/notice/${family}-status-1`,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    quote_id: null,
    quotes_count: 0,
    replies_count: 2,
    reblogs_count: 3,
    favourites_count: 5,
    dislikes_count: 1,
    favourited: false,
    disliked: false,
    reblogged: false,
    mentions: [],
    emoji_reactions: [],
    sensitive: false,
    spoiler_text: "",
    account: makeAccount(family),
    card: null,
    group: family === "pleroma" ? null : makeGroup(family),
    media_attachments: [],
    ...overrides,
  };
}

export function makeDegradedStatus(
  family: Extract<FediverseServerFamily, "rebased" | "pleroma">,
  overrides: Partial<UnfathomablyStatus> = {},
): UnfathomablyStatus {
  return makeStatus(family, {
    dislikes_count: undefined,
    disliked: undefined,
    emoji_reactions: undefined,
    group: null,
    pleroma: undefined,
    quote_id: undefined,
    quotes_count: undefined,
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
