/*
    Project: Hoot Mobile
    -------------------

    File: sourceLabels.ts

    Purpose:

        Convert Lotide source-feed software and target identifiers into
        readable labels for mobile screens.

    Responsibilities:

        - Keep source-feed labels consistent across list and detail screens
        - Cover Lotide 0.18 source-discovery software families
        - Fall back safely for future software keys

    This file intentionally does NOT contain:

        - source-feed API requests
        - React components
        - feature-gating rules
*/

const SOURCE_SOFTWARE_LABELS: Record<string, string> = {
  bookwyrm: "BookWyrm",
  castopod: "Castopod",
  discourse: "Discourse",
  funkwhale: "Funkwhale",
  funkwhale_library: "Funkwhale",
  gancio: "Gancio",
  gotosocial: "GoToSocial",
  iceshrimp: "Iceshrimp",
  lemmy: "Lemmy",
  mbin: "Mbin",
  misskey: "Misskey",
  mitra: "Mitra",
  mobilizon: "Mobilizon",
  nodebb: "NodeBB",
  owncast: "Owncast",
  peertube: "PeerTube",
  piefed: "PieFed",
  pixelfed: "Pixelfed",
  postmarks: "Postmarks",
  sharkey: "Sharkey",
  snac: "snac",
  wafrn: "Wafrn",
  wordpress: "WordPress",
  wordpress_event_bridge: "WordPress Event Bridge",
  writefreely: "WriteFreely",
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  actor_feed: "actor feed",
  collection: "collection",
  funkwhale_library: "library",
  Group: "group",
  group: "group",
};

export function sourceSoftwareLabel(software?: string | null): string {
  if (!software) return "Unknown";

  return SOURCE_SOFTWARE_LABELS[software] || software;
}

export function sourceKindLabel(kind?: string | null): string {
  if (!kind) return "feed";

  return SOURCE_KIND_LABELS[kind] || kind;
}

/* end of sourceLabels.ts */
