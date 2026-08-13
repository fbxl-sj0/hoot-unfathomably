# Unfathomably compatibility

Hoot Unfathomably 0.6.0 was reviewed against these upstream revisions:

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
Unfathomably, Rebased, Pleroma, Akkoma, and Mastodon. The app understands the
expanded 3.5 event,
participation, group, emoji, poll, move, edit, and follow notification types.
The v2 grouped envelope is used when advertised by Unfathomably or Mastodon,
but is not required to keep notifications correct or preserve degraded
compatibility. Local categories, digest delivery, quiet hours, sound, and
preview preferences operate on the normalized v1 event boundary.

Foreground screens also use the backend's advertised streaming API. The app
prefers the streaming origin from Mastodon v2
`configuration.urls.streaming`, falls back to the v1 `urls.streaming_api`
advertisement, and finally uses the selected API origin. The OAuth token is a
WebSocket subprotocol, not a URL query parameter. Mastodon and Unfathomably use
the current path-style routes. The mapped streams are:

- `/api/v1/streaming/user` for the home timeline
- `/api/v1/streaming/user/notification` for notification activity
- `/api/v1/streaming/user/groups` for all joined-group posts
- `/api/v1/streaming/group/:id` for one group discussion
- `/api/v1/streaming/user/sources` for all followed-source posts
- `/api/v1/streaming/source/:id` for one source

Pleroma, Akkoma, and Rebased use their documented unified
`/api/v1/streaming?stream=...` form for common streams. Notification activity
uses Pleroma's plural `user:notifications` spelling. Unfathomably-only group
and Source extensions retain their path routes. Backend selection comes from
public instance metadata, not a hostname list.

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
- account lookup, local or remote account search, relationship state, follow,
  pending-request cancellation, unfollow, follower and following lists
- incoming follow-request approval and rejection, plus account mute and block
- standard bookmarks, a saved-post timeline, and signed-in account post deletion
- account-scoped offline timeline and notification caches
- complete local composer drafts with durable media and alt text
- standard scheduled statuses, source retrieval, and existing-post editing
- standard lists, membership, and list timelines
- Mastodon filter v2 with a legacy filter v1 fallback
- server translation and native moderation reports
- profile text, fields, image, and privacy editing
- explicit cross-account favourite, repost, and emoji actions

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

## Wider Fediverse degradation

The common baseline remains available when an optional extension is absent:

- login to any selected HTTPS host
- home timeline and account timeline
- status threads and bounded context fallback
- ordinary posts and replies
- reposts and favourites
- profiles, account search, follow relationships, bookmarks, and own-post deletion
- drafts, lists, compatible filters, profile editing, reports, and scheduling
  when the corresponding standard server endpoint is present
- notifications and link previews
- classic user and notification live streams when the server provides them
- image and supported media viewing

Quote reposts, emoji reactions, dislikes, groups, Worlds, Sources, event
participation, book libraries, route publishing, and other extensions are shown
only when their response fields or instance features make them usable. The app
reports a concise unavailable state when a compatible server returns
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

Akkoma uses the same common Mastodon API and Pleroma reaction endpoints. The
client accepts both `pleroma_custom_emoji_reactions` and Akkoma's current
`custom_emoji_reactions` capability spelling. Its top-level `quote`,
`quote_id`, and `emoji_reactions` status fields are handled without requiring
an Unfathomably extension.

Mastodon keeps replies, reposts, favourites, polls, notifications, context,
profiles, and media on the common baseline. Mastodon 4.5 and newer quote posts
use `quoted_status_id` when publishing and a nested `quote.quoted_status` when
reading. The composer selects that contract from the target status instead of
sending the Rebased, Pleroma, Akkoma, and Unfathomably `quote_id` field. Quote
controls are hidden when Mastodon's per-status approval data says the current
account is denied. Emoji and thumbs-down controls remain hidden when their
response fields are absent.

## Read-only live compatibility check

On August 13, 2026, `npm run probe:fediverse` verified the public response
contracts of these established servers:

- social.fbxl.net, Unfathomably
- social.teci.world, Rebased with Soapbox
- poa.st, Pleroma with Soapbox
- pleroma.soykaf.com and udongein.xyz, Pleroma
- outmo.de, Akkoma
- fosstodon.org and mstdn.social, Mastodon 4.6

FBXL Social, TECI Social, and Poast exposed usable Soapbox or Unfathomably
frontend colors. Pleroma/Soykaf, Udongein, and Outmo.de advertised valid
Pleroma FE theme presets, which the app loads from their documented public
static theme path. The Mastodon servers did not publish a supported color
configuration and therefore used the accessible local fallback. Poast requires
authorization for its public timeline, which the probe records as a valid
server policy. The other tested servers returned a standard status array or an
empty standard array. Older Pleroma and Akkoma servers may omit
`/api/v2/instance`; the app already falls back to the v1 streaming advertisement
and then the selected origin.

The live probe uses public `GET` requests only. It does not receive credentials,
register an application, create content, react, follow, or change server state.
The same response differences are retained as local fixtures, so the release
suite does not depend on these public hosts remaining online.

## Authenticated local Docker matrix

On August 13, 2026, the version 0.6.0 service layer passed all 11 authenticated
workflows against disposable Docker targets built from Unfathomably
`de930df6d18b`, Rebased `cb3e04623556`, Pleroma 2.10.2 at `cd8816eccec3`,
Akkoma 3.20.0 at `98fcccccb153`, and the official Mastodon 4.6.5 image.

The local suite verified profile editing, status create/read/resolve/edit,
reactions, lists, filters, scheduled posts, notifications, reports, group
capability handling, grouped-notification availability, and translation
availability. It found and now guards four interoperability defects:

- Pleroma-family status resolution must prefer the canonical ActivityPub URI
  over a presentation URL.
- concurrent OAuth application registration for one server must share one
  in-flight request.
- Pleroma 2.10 must retry list creation with its portable title-only payload
  after rejecting newer optional fields.
- a missing source language must become a useful translation-unavailable
  message rather than a raw HTTP error.

The loopback-only runner and exact safety boundary are in
[testing/docker-fediverse/README.md](testing/docker-fediverse/README.md).

<!-- end of UNFATHOMABLY-COMPATIBILITY.md -->
