/*
    Project: Hoot Unfathomably
    --------------------------

    File: SavedAccountService.ts

    Purpose:

        Provide a safe reusable view of authenticated accounts stored locally.

    Responsibilities:

        - Return canonical account keys with hydrated saved contexts
        - Keep the active account first and remove duplicate aliases
        - Resolve explicit account selections for cross-account operations

    This file intentionally does NOT contain:

        - account switching side effects
        - network requests
        - credential persistence implementation
*/

import {
  accountStoreKeyForContext,
  lotideContextKV,
} from "./StorageService";
import type { UnfathomablyAccount } from "./UnfathomablyService";

export type SavedAuthenticatedAccount = {
  account: UnfathomablyAccount;
  context: LotideContext;
  isActive: boolean;
  key: string;
};

function asAccount(ctx: LotideContext): UnfathomablyAccount | undefined {
  const user = ctx.login?.user as unknown as UnfathomablyAccount | undefined;
  return user && typeof user.username === "string" && typeof user.id === "string"
    ? user
    : undefined;
}

export async function getSavedAuthenticatedAccounts(
  activeContext: LotideContext,
): Promise<SavedAuthenticatedAccount[]> {
  const activeKey = accountStoreKeyForContext(activeContext);
  const contexts = await lotideContextKV.getStore();
  const candidates = activeKey
    ? [[activeKey, activeContext] as const, ...Object.entries(contexts)]
    : Object.entries(contexts);
  const seen = new Set<string>();
  const accounts: SavedAuthenticatedAccount[] = [];

  for (const [storedKey, context] of candidates) {
    const key = accountStoreKeyForContext(context) || storedKey;
    const account = asAccount(context);
    if (!key || !context.login?.token || !account || seen.has(key)) continue;

    seen.add(key);
    accounts.push({
      account,
      context,
      isActive: key === activeKey,
      key,
    });
  }

  return accounts.sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
}

export async function resolveSelectedAccountContexts(
  activeContext: LotideContext,
  selectedKeys: string[],
): Promise<SavedAuthenticatedAccount[]> {
  const selected = new Set(selectedKeys);
  const accounts = await getSavedAuthenticatedAccounts(activeContext);
  return accounts.filter(account => selected.has(account.key));
}

/* end of SavedAccountService.ts */
