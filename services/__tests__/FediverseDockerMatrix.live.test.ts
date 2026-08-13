/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseDockerMatrix.live.test.ts

    Purpose:

        Exercise the real mobile service layer against an isolated local
        Fediverse backend created by the Docker compatibility harness.

    Responsibilities:

        - Authenticate two disposable users against the running backend
        - Cover standard read, write, edit, schedule, list, filter, and safety APIs
        - Verify richer Unfathomably and Rebased APIs or their graceful fallback
        - Remove mutable records when the disposable server remains available

    This file intentionally does NOT contain:

        - public-instance credentials
        - browser-driven OAuth authorization
        - assertions against persistent or externally operated servers
*/

import * as Accounts from "../UnfathomablyAccountService";
import * as Filters from "../UnfathomablyFiltersService";
import * as Lists from "../UnfathomablyListsService";
import * as Profile from "../UnfathomablyProfileService";
import * as Safety from "../UnfathomablySafetyService";
import * as Unfathomably from "../UnfathomablyService";

type MatrixIdentity = {
  account: Unfathomably.UnfathomablyAccount;
  context: LotideContext;
};

type CreatedGroup = Unfathomably.UnfathomablyGroup & { id: string };

const matrixEnabled = process.env.HOOT_DOCKER_MATRIX === "1";
const describeMatrix = matrixEnabled ? describe : describe.skip;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the Docker matrix.`);
  return value;
}

async function matrixIdentity(
  origin: string,
  usernameName: string,
  passwordName: string,
  tokenName: string,
): Promise<MatrixIdentity> {
  const suppliedToken = process.env[tokenName]?.trim();
  if (suppliedToken) {
    const context: LotideContext = {
      apiUrl: origin,
      login: { token: suppliedToken },
    };
    const account =
      await Unfathomably.request<Unfathomably.UnfathomablyAccount>(
        context,
        "/api/v1/accounts/verify_credentials",
      );
    return { account, context };
  }

  const login = await Unfathomably.loginWithPassword(
    origin,
    requiredEnvironment(usernameName),
    requiredEnvironment(passwordName),
  );
  return {
    account: login.account,
    context: {
      apiUrl: origin,
      login: { token: login.token },
    },
  };
}

function isStatus(
  value:
    Unfathomably.UnfathomablyScheduledStatus | Unfathomably.UnfathomablyStatus,
): value is Unfathomably.UnfathomablyStatus {
  return "account" in value;
}

async function notificationsEventually(
  context: LotideContext,
  predicate: (notification: Unfathomably.UnfathomablyNotification) => boolean,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const notifications = await Unfathomably.getNotifications(context);
    const match = notifications.find(predicate);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The expected local notification was not delivered.");
}

describeMatrix("authenticated Docker Fediverse compatibility matrix", () => {
  jest.setTimeout(120_000);

  const origin = matrixEnabled ? requiredEnvironment("HOOT_MATRIX_ORIGIN") : "";
  const expectedFamily = matrixEnabled
    ? requiredEnvironment("HOOT_MATRIX_FAMILY")
    : "unknown";
  const marker = `hoot-matrix-${expectedFamily}-${Date.now()}`;
  let primary: MatrixIdentity;
  let secondary: MatrixIdentity;
  let status: Unfathomably.UnfathomablyStatus | undefined;
  let listId: string | undefined;
  let filter: Filters.FediverseFilter | undefined;
  let group: CreatedGroup | undefined;

  beforeAll(async () => {
    [primary, secondary] = await Promise.all([
      matrixIdentity(
        origin,
        "HOOT_MATRIX_PRIMARY_USERNAME",
        "HOOT_MATRIX_PRIMARY_PASSWORD",
        "HOOT_MATRIX_PRIMARY_TOKEN",
      ),
      matrixIdentity(
        origin,
        "HOOT_MATRIX_SECONDARY_USERNAME",
        "HOOT_MATRIX_SECONDARY_PASSWORD",
        "HOOT_MATRIX_SECONDARY_TOKEN",
      ),
    ]);
  });

  afterAll(async () => {
    const cleanup: Promise<unknown>[] = [];
    if (listId) cleanup.push(Lists.deleteList(primary.context, listId));
    if (filter) cleanup.push(Filters.deleteFilter(primary.context, filter));
    if (status)
      cleanup.push(Unfathomably.deleteStatus(primary.context, status.id));
    if (group) {
      cleanup.push(
        Unfathomably.request(
          primary.context,
          `/api/v1/groups/${encodeURIComponent(group.id)}`,
          { method: "DELETE" },
        ),
      );
    }
    await Promise.allSettled(cleanup);
  });

  test("detects the running software and authenticates both accounts", async () => {
    const instance = await Unfathomably.getInstance(origin);
    expect(Unfathomably.getInstanceSoftware(instance).family).toBe(
      expectedFamily,
    );
    expect(primary.account.id).not.toBe(secondary.account.id);

    const verified = await Accounts.getAccount(
      primary.context,
      primary.account.id,
    );
    expect(verified.acct).toBe(primary.account.acct);
  });

  test("updates the local profile through the native credentials endpoint", async () => {
    const updated = await Profile.updateProfile(primary.context, {
      bot: false,
      discoverable: true,
      displayName: `Matrix ${expectedFamily}`,
      fields: [{ name: "Test", value: marker }],
      locked: false,
      note: `Disposable compatibility test ${marker}`,
    });

    expect(updated.display_name).toBe(`Matrix ${expectedFamily}`);
    expect(updated.note).toContain(marker);
  });

  test("publishes, reads, resolves, and edits a status", async () => {
    const created = await Unfathomably.createStatus(
      primary.context,
      `${marker} original`,
      { idempotencyKey: marker, language: "en", visibility: "public" },
    );
    expect(isStatus(created)).toBe(true);
    if (!isStatus(created))
      throw new Error("Immediate post was scheduled unexpectedly.");
    status = created;

    const fetched = await Unfathomably.getStatus(primary.context, status.id);
    expect(fetched.content).toContain(`${marker} original`);
    const timeline = await Unfathomably.getHomeTimeline(primary.context);
    expect(timeline.some(item => item.id === status!.id)).toBe(true);
    const resolved = await Unfathomably.resolveStatusByUrl(
      primary.context,
      status.uri || status.url!,
    );
    expect(resolved.id).toBe(status.id);

    const edited = await Unfathomably.updateStatus(
      primary.context,
      status.id,
      `${marker} edited`,
      { contentWarning: "Matrix warning", language: "en", sensitive: true },
    );
    expect(edited.content).toContain(`${marker} edited`);
    expect(
      (await Unfathomably.getStatusSource(primary.context, status.id)).text,
    ).toContain(`${marker} edited`);
    expect(
      (await Unfathomably.getStatusContext(primary.context, status.id))
        .ancestors,
    ).toEqual([]);
  });

  test("applies and reverses standard post reactions", async () => {
    const target = status!;
    expect(
      (await Unfathomably.favouriteStatus(primary.context, target.id))
        .favourited,
    ).toBe(true);
    expect(
      (await Unfathomably.favouriteStatus(primary.context, target.id, true))
        .favourited,
    ).toBe(false);
    expect(
      (await Unfathomably.reblogStatus(primary.context, target.id)).reblogged,
    ).toBe(true);
    expect(
      (await Unfathomably.reblogStatus(primary.context, target.id, true))
        .reblogged,
    ).toBe(false);
    expect(
      (await Unfathomably.bookmarkStatus(primary.context, target.id))
        .bookmarked,
    ).toBe(true);
    expect(
      (await Unfathomably.bookmarkStatus(primary.context, target.id, true))
        .bookmarked,
    ).toBe(false);
  });

  test("creates a followed-account list and loads its timeline", async () => {
    const relationship = await Accounts.setAccountFollowed(
      primary.context,
      secondary.account.id,
      true,
    );
    expect(relationship.following || relationship.requested).toBe(true);

    const list = await Lists.createList(primary.context, {
      exclusive: false,
      repliesPolicy: "list",
      title: `Matrix ${expectedFamily}`,
    });
    listId = list.id;
    await Lists.addAccountsToList(primary.context, list.id, [
      secondary.account.id,
    ]);
    expect(
      (await Lists.getListAccounts(primary.context, list.id)).some(
        account => account.id === secondary.account.id,
      ),
    ).toBe(true);
    expect(
      Array.isArray(await Lists.getListTimeline(primary.context, list.id)),
    ).toBe(true);
    await Lists.removeAccountsFromList(primary.context, list.id, [
      secondary.account.id,
    ]);
  });

  test("creates, updates, lists, and deletes the best filter API available", async () => {
    filter = await Filters.createFilter(primary.context, {
      action: "warn",
      contexts: ["home", "notifications"],
      expiresIn: 3_600,
      keywords: [{ keyword: marker, wholeWord: false }],
      title: `Matrix ${expectedFamily}`,
    });
    expect(
      (await Filters.getFilters(primary.context)).some(
        item => item.id === filter!.id,
      ),
    ).toBe(true);
    filter = await Filters.updateFilter(primary.context, filter, {
      action: "hide",
      contexts: ["home"],
      keywords: [
        {
          id: filter.keywords[0]?.id,
          keyword: `${marker}-updated`,
          wholeWord: true,
        },
      ],
      title: `Updated ${expectedFamily}`,
    });
    expect(filter.action).toBe("hide");
    await Filters.deleteFilter(primary.context, filter);
    filter = undefined;
  });

  test("schedules, reschedules, and cancels a status", async () => {
    const scheduled = await Unfathomably.createStatus(
      primary.context,
      `${marker} scheduled`,
      { scheduledAt: new Date(Date.now() + 15 * 60_000).toISOString() },
    );
    expect(isStatus(scheduled)).toBe(false);
    if (isStatus(scheduled))
      throw new Error("Server published a scheduled post immediately.");
    expect(
      (await Unfathomably.getScheduledStatuses(primary.context)).some(
        item => item.id === scheduled.id,
      ),
    ).toBe(true);
    const rescheduled = await Unfathomably.updateScheduledStatus(
      primary.context,
      scheduled.id,
      new Date(Date.now() + 20 * 60_000).toISOString(),
    );
    expect(rescheduled.id).toBe(scheduled.id);
    await Unfathomably.cancelScheduledStatus(primary.context, scheduled.id);
  });

  test("delivers notifications and submits a native report", async () => {
    const mention = await Unfathomably.createStatus(
      secondary.context,
      `@${primary.account.acct} ${marker} mention`,
    );
    if (!isStatus(mention))
      throw new Error("Mention was scheduled unexpectedly.");
    const notification = await notificationsEventually(
      primary.context,
      item => item.status?.id === mention.id || item.type === "mention",
    );
    expect(notification.account.id).toBe(secondary.account.id);

    const report = await Safety.reportAccountOrStatus(primary.context, {
      accountId: secondary.account.id,
      category: "other",
      comment: `Disposable local report ${marker}`,
      forward: false,
      statusIds: [mention.id],
    });
    expect(report.id).toBeTruthy();
    await Unfathomably.deleteStatus(secondary.context, mention.id);
  });

  test("uses groups or returns the deliberate compatibility fallback", async () => {
    const instance = await Unfathomably.getInstance(origin);
    const capabilities = Unfathomably.getInstanceCapabilities(instance);
    let outcome: string;

    if (capabilities.groups) {
      group = await Unfathomably.request<CreatedGroup>(
        primary.context,
        "/api/v1/groups",
        {
          body: JSON.stringify({
            discoverable: true,
            display_name: `Matrix ${expectedFamily} ${Date.now()}`,
            note: marker,
          }),
          method: "POST",
        },
      );
      const listed = (await Unfathomably.getGroups(primary.context)).some(
        item => item.id === group!.id,
      );
      const groupStatus = await Unfathomably.createStatus(
        primary.context,
        `${marker} group post`,
        { groupId: group.id },
      );
      if (!isStatus(groupStatus)) {
        throw new Error("Group post was scheduled unexpectedly.");
      }
      const posted = (
        await Unfathomably.getGroupStatuses(primary.context, group.id)
      ).some(item => item.id === groupStatus.id);
      await Unfathomably.deleteStatus(primary.context, groupStatus.id);
      outcome = `groups:${listed}:${posted}`;
    } else {
      outcome = await Unfathomably.getGroups(primary.context).then(
        () => "fallback:missing",
        reason => `fallback:${(reason as Error).message}`,
      );
    }

    expect(outcome).toBe(
      capabilities.groups
        ? "groups:true:true"
        : "fallback:Groups are not available on this server.",
    );
    expect(
      capabilities.groups || expectedFamily !== "unfathomably",
    ).toBe(true);
  });

  test("uses grouped notifications only where the current API exists", async () => {
    const grouped = await Unfathomably.getGroupedNotifications(primary.context);
    const outcome =
      grouped &&
      Array.isArray(grouped.accounts) &&
      Array.isArray(grouped.notification_groups) &&
      Array.isArray(grouped.statuses)
        ? "available"
        : "unavailable";
    expect(outcome).toBe(
      ["mastodon", "unfathomably"].includes(expectedFamily)
        ? "available"
        : "unavailable",
    );
  });

  test("translation succeeds or returns the deliberate unavailable message", async () => {
    const outcome = await Safety.translateStatus(
      primary.context,
      status!.id,
      "fr",
    ).then(
      translation => `translated:${translation.content.trim()}`,
      reason => `unavailable:${(reason as Error).message.toLowerCase()}`,
    );
    expect(outcome).toMatch(/^(?:translated:.+|unavailable:.*translation.*)$/);
  });
});

/* end of FediverseDockerMatrix.live.test.ts */
