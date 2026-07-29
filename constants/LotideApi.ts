/*
    Project: Hoot Mobile
    -------------------

    File: LotideApi.ts

    Purpose:

        Defines app-wide Lotide API compatibility constants.

    Responsibilities:

        - Keep the supported server API floor consistent across startup
          synchronization and host selection
        - Provide a named value for compatibility checks that would otherwise
          look like unexplained magic numbers

    This file intentionally does NOT contain:

        - network requests
        - per-endpoint validation
        - UI state
*/

export const MINIMUM_LOTIDE_API_VERSION = 8;

export function supportsCollectionTargets(apiVersion?: number): boolean {
  return (apiVersion || 0) >= 18;
}

export function supportsPrivateMessages(apiVersion?: number): boolean {
  return (apiVersion || 0) >= 18;
}

export function supportsUserFollows(apiVersion?: number): boolean {
  return (apiVersion || 0) >= 18;
}

export function supportsUserFollowNotifications(apiVersion?: number): boolean {
  return (apiVersion || 0) >= 17;
}

/* end of LotideApi.ts */
