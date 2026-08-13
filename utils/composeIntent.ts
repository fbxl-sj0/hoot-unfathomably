/*
    Project: Hoot Unfathomably
    --------------------------

    Build complete, uniquely identified requests for the reusable composer.
    Explicitly clearing unrelated fields prevents React Navigation from
    carrying a previous group, reply, or quote target into the next post.
*/

import type { QuoteParameter } from "../services/UnfathomablyService";

export type ComposeIntent = {
  composeIntentId: string;
  draftId?: string;
  editStatusId?: string;
  groupId?: string;
  groupName?: string;
  inReplyToId?: string;
  quoteId?: string;
  quoteParameter?: QuoteParameter;
};

let composeIntentSequence = 0;
const composeIntentSession = Date.now().toString(36);

export function createComposeIntent(
  requested: Partial<Omit<ComposeIntent, "composeIntentId">> = {},
): ComposeIntent {
  composeIntentSequence += 1;
  return {
    composeIntentId: `compose-${composeIntentSession}-${composeIntentSequence}`,
    draftId: undefined,
    editStatusId: undefined,
    groupId: undefined,
    groupName: undefined,
    inReplyToId: undefined,
    quoteId: undefined,
    quoteParameter: undefined,
    ...requested,
  };
}

/* end of composeIntent.ts */
