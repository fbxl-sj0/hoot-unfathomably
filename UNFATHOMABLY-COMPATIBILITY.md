# Unfathomably compatibility

Hoot Unfathomably 0.4.1 was reviewed against these upstream revisions:

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

Foreground screens also use the backend's path-style streaming API. The app
prefers the streaming origin from Mastodon v2
`configuration.urls.streaming`, falls back to the v1 `urls.streaming_api`
advertisement, and finally uses the selected API origin. The OAuth token is a
WebSocket subprotocol, not a URL query parameter. The mapped streams are:

- `/api/v1/streaming/user` for the home timeline
- `/api/v1/streaming/user/notification` for notification activity
- `/api/v1/streaming/user/groups` for all joined-group posts
- `/api/v1/streaming/group/:id` for one group discussion
- `/api/v1/streaming/user/sources` for all followed-source posts
- `/api/v1/streaming/source/:id` for one source

The client understands `update`, `status.update`, `delete`, and `notification`
events on the screens that consume them. It closes foreground sockets when the
app sleeps, reconnects with exponential backoff and jitter, and performs a REST
catch-up after any gap. Android background notification delivery deliberately
continues to use the scheduled REST poller because the operating system does
not keep a JavaScript WebSocket reliably alive in the background.

## Unfathomably 3.5 mobile surface

The app supports:

- all 16 Worlds families from the server workflow manifest
- native-object timelines, bounded discovery, explicit local resolution, and
  authoritative source links
- native status facts and Nostr, AT Protocol, or diaspora* provenance
- own-account reading shelves through `GET`, `POST`, and `DELETE`
  `/api/v1/book_shelves`, with the standard to-read, reading, read, and
  stopped-reading shelf identifiers and page or percent progress
- explicit federated book reviews, comments, and quotations through the books
  native-object template, separate from quiet shelf changes
- foreground-only Android GPS recording with pause-safe GPX segments, bounded
  GPX import and export, private on-device draft recovery, media upload, and
  confirmed publication through the routes native-object template
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

The paired browser frontend remains the complete interface for general
native-object authoring across all 16 schema families, organizer and group
moderation, archive import, federation diagnostics, administration, chat, and
other large workflows. The mobile client deliberately implements the book and
GPS route workflows where a phone provides a useful focused experience. Other
families are not represented as partially working generic forms.

Route import currently accepts GPX. The paired web client also has desktop
importers for TCX, KML, and FIT. Android route recording is foreground-only: no
background-location permission, foreground service, automatic reverse
geocoding, or hidden publication is used. A native object already represented
by a status receives the normal reply and reaction controls. A resolved
resource without a local status remains read-only and retains its authoritative
source link, except for the focused Books library action.

## Rebased and Pleroma degradation

The common baseline remains available when an optional extension is absent:

- login to any selected HTTPS host
- home timeline and account timeline
- status threads and bounded context fallback
- ordinary posts and replies
- reposts and favourites
- notifications and link previews
- classic user and notification live streams when the server provides them
- image and supported media viewing

Quote reposts, emoji reactions, dislikes, groups, Worlds, Sources, event
participation, book libraries, route publishing, and other extensions are shown
only when their response fields or instance features make them usable. The app
reports a concise unavailable state when a Rebased or Pleroma server returns
404, 405, 410, or 501 for a Books or Routes extension; ordinary feeds and
discussions remain usable. Older Rebased group search falls back
from `/api/v1/groups/search` to `/api/v1/groups?q=...` only for explicit
unavailable statuses. Older group detail can fall back to the group collection.
Authorization, gateway, and server failures are never hidden by those
fallbacks.
Missing group or Source streams do not remove their REST workflows. This keeps
older Rebased extensions useful and leaves plain Pleroma on its common live or
REST baseline without treating a missing optional WebSocket path as a screen
failure.

<!-- end of UNFATHOMABLY-COMPATIBILITY.md -->
