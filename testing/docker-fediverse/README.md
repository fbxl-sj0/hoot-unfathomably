# Local Fediverse compatibility matrix

The live matrix proves that Hoot Unfathomably uses standard Mastodon APIs where possible and degrades deliberately on older server families. It is separate from the ordinary unit suite because it creates accounts and mutable records.

Never point this suite at a public instance. The runner rejects non-loopback origins. Each test run creates posts, follows, lists, filters, scheduled posts, notifications, and a moderation report using disposable users.

## Tested release matrix

Version 0.6.0 was authenticated against these isolated Docker targets on August 13, 2026:

| Family | Tested source or image | Result |
| --- | --- | --- |
| Unfathomably | `de930df6d18b` | 11 of 11 workflows passed |
| Rebased | `cb3e04623556` from `develop` | 11 of 11 workflows passed |
| Pleroma | `cd8816eccec3`, version 2.10.2 | 11 of 11 workflows passed |
| Akkoma | `98fcccccb153`, version 3.20.0 | 11 of 11 workflows passed |
| Mastodon | official `ghcr.io/mastodon/mastodon:v4.6.5` image | 11 of 11 workflows passed |

PostgreSQL and Redis were isolated per server. Mastodon also ran Sidekiq because home-timeline fanout and notifications are asynchronous. A loopback reverse proxy supplied HTTPS forwarding headers where production server configuration required them.

The workflows cover:

- instance-family detection and two authenticated accounts
- profile editing
- status publication, retrieval, URL resolution, editing, source retrieval, and deletion
- favourite, repost, and bookmark round trips
- follows, lists, membership, and list timelines
- current filters or the legacy filter fallback
- scheduling, rescheduling, and cancellation
- mention delivery and native reports
- groups on Unfathomably and the deliberate unavailable result elsewhere
- grouped notifications where the server implements them
- translation or a normalized unavailable response

## Running one target

Provision a disposable server and two disposable users, then export the following variables. Passwords are kept out of command-line history and the repository.

```bash
export HOOT_MATRIX_FAMILY=mastodon
export HOOT_MATRIX_ORIGIN=http://127.0.0.1:18150
export HOOT_MATRIX_PRIMARY_USERNAME=matrix_primary
export HOOT_MATRIX_PRIMARY_PASSWORD='local-only-password'
export HOOT_MATRIX_SECONDARY_USERNAME=matrix_secondary
export HOOT_MATRIX_SECONDARY_PASSWORD='local-only-password'
npm run test:docker-matrix
```

The family must be `unfathomably`, `rebased`, `pleroma`, `akkoma`, or `mastodon`. OAuth tokens may be supplied as `HOOT_MATRIX_PRIMARY_TOKEN` and `HOOT_MATRIX_SECONDARY_TOKEN`; username and password variables are still required by the safety wrapper so that an accidentally incomplete invocation cannot run.

Run targets sequentially on this workstation. Several upstream images exceed 1 GB, and concurrent builds make failures harder to attribute. Remove each target's containers, network, volume, and build image after its test completes.

## Server notes

- Use each project's own release configuration and migration commands. Do not replace its application code with test doubles.
- Disable optional external OAuth consumer strategies. The matrix exercises first-party Mastodon-compatible application registration and password or token authentication.
- Pleroma 2.10 accepts the portable title-only list payload. The app retries that payload only after a 400 or 422 response to newer list fields.
- Unfathomably must advertise and pass its group API. Other families must return the explicit compatibility message rather than an arbitrary HTTP error.
- The test performs best-effort record cleanup, but the complete Docker target is disposable because some moderation and notification records are intentionally immutable.

<!-- end of testing/docker-fediverse/README.md -->
