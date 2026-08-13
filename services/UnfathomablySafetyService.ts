/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablySafetyService.ts

    Purpose:

        Provide portable translation and user-initiated moderation reports.

    Responsibilities:

        - Request server-side status translation without contacting a provider
        - Submit bounded account or post reports to the selected home server
        - Normalize absent optional endpoints into clear feature messages

    This file intentionally does NOT contain:

        - automatic translation
        - client-side moderation decisions
        - report form presentation
*/

import { request } from "./UnfathomablyService";

export type StatusTranslation = {
  content: string;
  detectedSourceLanguage?: string;
  provider?: string;
  spoilerText?: string;
};

export type FediverseReportCategory = "other" | "spam" | "violation";

export type FediverseReportInput = {
  accountId: string;
  category?: FediverseReportCategory;
  comment?: string;
  forward?: boolean;
  ruleIds?: string[];
  statusIds?: string[];
};

export type FediverseReport = {
  action_taken?: boolean;
  action_taken_at?: string | null;
  category?: string;
  comment?: string;
  forwarded?: boolean;
  id: string;
  status_ids?: string[] | null;
  target_account?: { id: string; acct?: string };
};

const UNAVAILABLE_STATUSES = new Set([404, 405, 410, 501]);

function isUnavailable(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return typeof status === "number" && UNAVAILABLE_STATUSES.has(status);
}

function lacksSourceLanguage(error: unknown): boolean {
  const candidate = error as Error & { status?: number };
  return candidate?.status === 400 && /language/i.test(candidate.message);
}

export async function translateStatus(
  ctx: LotideContext,
  statusId: string,
  targetLanguage?: string,
): Promise<StatusTranslation> {
  const language = targetLanguage?.trim().slice(0, 16);
  try {
    const response = await request<{
      content?: string;
      detected_source_language?: string;
      provider?: string;
      spoiler_text?: string;
      text?: string;
    }>(
      ctx,
      `/api/v1/statuses/${encodeURIComponent(statusId)}/translate`,
      {
        method: "POST",
        body: JSON.stringify({
          target_language: language || undefined,
        }),
      },
    );
    const content = response.content || response.text;
    if (!content) {
      throw new Error("The server returned an empty translation.");
    }

    return {
      content,
      detectedSourceLanguage: response.detected_source_language,
      provider: response.provider,
      spoilerText: response.spoiler_text,
    };
  } catch (error) {
    if (isUnavailable(error)) {
      throw new Error("Post translation is not available on this server.");
    }
    if (lacksSourceLanguage(error)) {
      throw new Error(
        "Post translation needs a source language, but this post does not specify one.",
      );
    }
    throw error;
  }
}

function normalizedIds(ids: string[] | undefined, limit: number): string[] {
  if (!ids) return [];
  return Array.from(new Set(
    ids.map(id => id.trim()).filter(Boolean),
  )).slice(0, limit);
}

export function reportAccountOrStatus(
  ctx: LotideContext,
  input: FediverseReportInput,
) {
  const accountId = input.accountId.trim();
  if (!accountId) {
    return Promise.reject(new Error("A report requires an account."));
  }

  const comment = input.comment?.trim().slice(0, 1_000);
  const category = input.category === "spam" || input.category === "violation"
    ? input.category
    : "other";

  return request<FediverseReport>(ctx, "/api/v1/reports", {
    method: "POST",
    body: JSON.stringify({
      account_id: accountId,
      category,
      comment: comment || undefined,
      forward: input.forward === true,
      rule_ids: normalizedIds(input.ruleIds, 100),
      status_ids: normalizedIds(input.statusIds, 20),
    }),
  });
}

/* end of UnfathomablySafetyService.ts */
