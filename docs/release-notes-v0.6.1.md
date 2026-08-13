# Hoot Unfathomably 0.6.1

This release makes emoji reactions instance-aware and keeps their state clear
and reliable across the supported Pleroma-family APIs.

## Highlights

- per-instance quick reactions from public Unfathomably, Soapbox, and Pleroma
  frontend configuration
- a per-host cache for quick reactions that is independent of theme support
- the current Unfathomably frontend fallback order: 👍, ❤️, 🤔, 😆, 😮, 😡, 😢,
  😏, and 🇫
- visible reaction counts and selected-state controls on posts
- custom remote reaction images with a readable shortcode fallback
- response reconciliation for servers that omit current-user ownership after a
  successful reaction mutation
- compatibility with top-level Akkoma and nested Pleroma, Rebased, and
  Unfathomably reaction shapes

## Validation

The release gate covers strict ESLint and TypeScript checks, the complete Jest
suite, Expo dependency compatibility, Expo Doctor, production dependency
auditing, and Android release lint. The release APK is also installed and
smoke-tested on an attached Android device before publication.

Android package: `org.brokenlamp.hootunfathomably`

Version code: `23`

<!-- end of docs/release-notes-v0.6.1.md -->
