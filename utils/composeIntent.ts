/*
    Project: Hoot Unfathomably
    --------------------------

    Build complete, uniquely identified requests for the reusable composer.
    Explicitly clearing unrelated fields prevents React Navigation from
    carrying a previous group, reply, or quote target into the next post.
*/

export type ComposeIntent = {
  composeIntentId: string;
  groupId?: string;
  groupName?: string;
  inReplyToId?: string;
  quoteId?: string;
};

let composeIntentSequence = 0;

export function createComposeIntent(
  requested: Partial<Omit<ComposeIntent, "composeIntentId">> = {},
): ComposeIntent {
  composeIntentSequence += 1;
  return {
    composeIntentId: `compose-${composeIntentSequence}`,
    groupId: undefined,
    groupName: undefined,
    inReplyToId: undefined,
    quoteId: undefined,
    ...requested,
  };
}

/* end of composeIntent.ts */
