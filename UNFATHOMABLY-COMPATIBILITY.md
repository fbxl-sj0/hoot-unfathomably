# Unfathomably compatibility

Hoot Unfathomably 0.3.0 was reviewed against these upstream revisions:

- unfathomably-be 3.5.0, commit `de930df6d18bf0f9cd124c4beb9d85dc23303620`
- unfathomably-fe, commit `5cf055beeb9f0a1453dca99b3559d1b786ae7f82`

Both revisions are dated August 12, 2026. This document records the mobile
contract so later upstream changes can be compared without reconstructing the
original work.

## Runtime detection

The app reads `GET /api/v1/instance` and uses
`pleroma.metadata.features` for optional capabilities. It does not decide
features from the hostname or a software-version branch. Unfathomably Worlds
is identified by the server's `unfathomably` identity fields, while individual
extensions such as groups, Sources, polls, event handling, quote posting,
emoji reactions, dislikes, and grouped notifications remain independently
advertised.

The stable Mastodon-compatible notification v1 endpoint remains the mobile
polling boundary. It provides deterministic per-event identifiers and works on
Unfathomably, Rebased, and Pleroma. The app understands the expanded 3.5 event,
participation, group, emoji, poll, move, edit, and follow notification types.
The v2 grouped envelope is therefore not required to keep notifications
correct or to preserve degraded compatibility.

## Unfathomably 3.5 mobile surface

The app supports:

- all 16 Worlds families from the server workflow manifest
- native-object timelines, bounded discovery, explicit local resolution, and
  authoritative source links
- native status facts and Nostr, AT Protocol, or diaspora* provenance
- followed Sources timelines, source lists, discovery, details, preview items,
  and follow relationships
- current group list, discovery, search, detail, relationship, permission,
  membership, status, and timeline routes
- standard and group posts, replies, quote reposts, visibility, content
  warnings, sensitive flags, and polls
- poll voting and returned result state
- event time, place, attendance, approval mode, and explicit participation
- image zoom plus guarded audio and video playback
- normal status threads, interactions, link cards, profiles, and notifications

Worlds search and source discovery are requested only from the selected local
server. The app does not contact a remote provider itself. Opening a discovery
result locally uses the server's native-object resolver. Opening the original
resource is a separate, explicit action.

## Deliberate mobile boundaries

The paired browser frontend remains the complete interface for native-object
authoring across all 16 schema families, organizer and group moderation,
archive import, federation diagnostics, administration, chat, and other large
workflows. Those facilities are not represented as partially working generic
forms in the mobile client.

Hoot Unfathomably is primarily a reading, discussion, reaction, group, source,
poll, and event-participation client. A native object already represented by a
status receives the normal reply and reaction controls. A resolved resource
without a local status remains read-only and retains its authoritative source
link.

## Rebased and Pleroma degradation

The common baseline remains available when an optional extension is absent:

- login to any selected HTTPS host
- home timeline and account timeline
- status threads and bounded context fallback
- ordinary posts and replies
- reposts and favourites
- notifications and link previews
- image and supported media viewing

Quote reposts, emoji reactions, dislikes, groups, Worlds, Sources, event
participation, and other extensions are shown only when their response fields
or instance features make them usable. Older Rebased group search falls back
from `/api/v1/groups/search` to `/api/v1/groups?q=...` only for explicit
unavailable statuses. Older group detail can fall back to the group collection.
Authorization, gateway, and server failures are never hidden by those
fallbacks.

<!-- end of UNFATHOMABLY-COMPATIBILITY.md -->
