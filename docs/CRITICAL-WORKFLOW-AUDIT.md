# Critical social workflow audit

This audit covers the workflows required to use Hoot Unfathomably as a safe,
ordinary mobile social client. A workflow is considered critical here when its
absence prevents account access, finding people, reading or joining a
discussion, publishing a response, controlling a relationship, handling
follow consent, saving a post for later, or removing content you published.

The API review uses unfathomably-be 3.5.0 at commit
`de930df6d18bf0f9cd124c4beb9d85dc23303620`. Portable account operations use
the standard Mastodon-compatible routes implemented by Unfathomably, Rebased,
Pleroma, Akkoma, and Mastodon.

## Audit result

| Workflow | Result | Evidence |
| --- | --- | --- |
| Select any compatible host and sign in | Present | OAuth and direct-login contract tests, saved account tests |
| Read and refresh the home timeline | Present | Feed screen and streaming tests |
| Read, join, leave, and post to groups | Present where advertised | Group extension tests and degraded baseline tests |
| Open a post, its parent, replies, media, and links | Present | Discussion, status-card, media, and link-preview tests |
| Compose posts, replies, quotes, polls, and scoped visibility | Present | Composer and discussion tests |
| Open any post or notification actor's profile | Added in 0.5.0 | Status-card and notification navigation tests |
| Find a local or remote account | Added in 0.5.0 | v2 search tests plus the narrow Pleroma/Rebased v1 fallback test |
| Follow, cancel a pending request, and unfollow | Added in 0.5.0 | Five-family service and screen tests |
| Browse followers and following | Added in 0.5.0 | Account connection route and screen tests |
| Accept or decline incoming follow requests | Added in 0.5.0 | People and notification decision tests |
| Mute, unmute, block, and unblock an account | Added in 0.5.0 | Confirmed relationship-action tests |
| Save, unsave, and revisit bookmarked posts | Added in 0.5.0 | Status action, bookmark list, and five-family route tests |
| Delete a post published by the signed-in account | Added in 0.5.0 | Ownership, confirmation, route, and removal-state tests |
| Receive notifications and open actor-only events | Present and corrected | Notification polling, streaming, and navigation tests |
| Log out without damaging another saved account | Present | Account storage and profile tests |

The live compatibility probe remains read-only. It verifies public account
profile responses whenever a host permits a public timeline lookup. Hosts that
require authentication are reported as such instead of being treated as
broken. Relationship mutations are never sent to public test instances.

## Deliberate non-critical mobile boundaries

The paired web frontend remains the full interface for profile media editing,
advanced lists and filters, archive import, administration, broad native-object
authoring, and chat. Existing posts can be removed in the app, while editing an
existing post remains a web workflow. These boundaries do not prevent the core
mobile loop of finding and following people, reading, participating, handling
consent, applying safety controls, saving posts, and removing your own post.

<!-- end of CRITICAL-WORKFLOW-AUDIT.md -->
