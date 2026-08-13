/*
    Project: Hoot Unfathomably
    --------------------------

    Ensure each visit to the reusable composer is a complete, fresh intent.
*/

import { createComposeIntent } from "../composeIntent";

describe("compose intents", () => {
  test("clears unrelated destinations and assigns a unique identity", () => {
    const groupIntent = createComposeIntent({
      groupId: "group-1",
      groupName: "Group One",
    });
    const replyIntent = createComposeIntent({
      inReplyToId: "status-1",
    });

    expect(groupIntent).toEqual({
      composeIntentId: expect.any(String),
      groupId: "group-1",
      groupName: "Group One",
      inReplyToId: undefined,
      quoteId: undefined,
      quoteParameter: undefined,
    });
    expect(replyIntent).toEqual({
      composeIntentId: expect.any(String),
      groupId: undefined,
      groupName: undefined,
      inReplyToId: "status-1",
      quoteId: undefined,
      quoteParameter: undefined,
    });
    expect(replyIntent.composeIntentId).not.toBe(
      groupIntent.composeIntentId,
    );
  });
});

/* end of composeIntent.test.ts */
