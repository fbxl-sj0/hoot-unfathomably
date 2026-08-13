# Hoot Unfathomably 0.6.0

This release turns the Android client into a much more complete daily Fediverse application while retaining Unfathomably groups, Worlds, Sources, books, and GPS paths.

## Highlights

- bounded per-account offline timeline and notification caches
- complete local drafts with durable media and alt text
- scheduled-post review, rescheduling, and cancellation
- existing-post and profile editing
- standard account lists and advanced content filters
- server translation and native moderation reports
- cross-account favourites, reposts, and emoji reactions
- per-account notification categories, digests, quiet hours, sound, and previews
- app text sizing, Android font scaling, high contrast, reduced motion, content-warning controls, image descriptions, and English, French, and Spanish localization
- safer media upload fallbacks and post sharing

## Compatibility

The authenticated local Docker suite passed all 11 workflows on each of:

- Unfathomably `de930df6d18b`
- Rebased `cb3e04623556`
- Pleroma 2.10.2
- Akkoma 3.20.0
- Mastodon 4.6.5

The ordinary release gate passes 56 test suites and 487 tests, strict ESLint and TypeScript checks, Expo Doctor's 19 checks, dependency compatibility, production dependency auditing, Android release lint, and an attached-device smoke test.

Android package: `org.brokenlamp.hootunfathomably`

Version code: `22`

<!-- end of docs/release-notes-v0.6.0.md -->
