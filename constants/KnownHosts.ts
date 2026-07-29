/*
    Project: Hoot Mobile
    -------------------

    File: KnownHosts.ts

    Purpose:

        Seed the login host picker with known Mastodon-compatible servers.

    Responsibilities:

        • Provide display names for well-known Unfathomably hosts
        • Keep host domains centralized for the login flow

    This file intentionally does NOT contain:

        • Network discovery logic
        • Login or account persistence behavior
*/

export interface KnownHost {
  name: string;
  domain: string;
}

const KnownHosts: KnownHost[] = [
  {
    name: "FBXL Social",
    domain: "social.fbxl.net",
  },
];

export default KnownHosts;

/* end of KnownHosts.ts */
