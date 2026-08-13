# Hoot Unfathomably

Hoot Unfathomably is a mobile client for the Unfathomably Fediverse stack. It
keeps Hoot's compact, readable post cards while adding a normal home timeline,
group discussions, first-class Worlds and Sources, and compatible features from
[unfathomably-be](https://github.com/fbxl-sj0/unfathomably-be) and
[unfathomably-fe](https://github.com/fbxl-sj0/unfathomably-fe).

Version 0.4.1 is the Unfathomably 3.5 live-updates release. It was developed
against unfathomably-be 3.5.0 and the paired August 12, 2026 frontend source.
The client reads the instance feature manifest at runtime, so optional screens
and controls follow the selected server rather than a hard-coded host or a
guessed software version.

It connects directly to an Unfathomably server. Compatible Pleroma and Rebased
servers provide the normal timeline and discussion experience; group features
appear when the server provides the Unfathomably-compatible group endpoints.
Older or capability-degraded Rebased and Pleroma servers retain the shared
Mastodon-compatible experience: login, home timeline, status discussions,
replies, reposts, favourites, notifications, and account timelines. Optional
quote, emoji, and negative-reaction controls appear only when the server's
responses advertise the corresponding extension. Group screens use the group
extension when present and show a clear unavailable state otherwise.

## Server login

FBXL Social is a convenience shortcut, not a fixed service. On the login
screen, enter any compatible server domain and continue. The preferred
**Sign in with Server** action uses the selected host's OAuth authorization
page, so the host handles credentials, multi-factor authentication, and account
approval. Direct password login remains available for Unfathomably, Pleroma,
and Rebased servers that support it.

Each saved profile retains its own server URL and secure token. Selecting a
saved account therefore cannot silently redirect that account to FBXL Social.

## What it does

- Browse your home timeline and a dedicated followed-groups timeline.
- Receive foreground timeline edits through the server's live WebSocket API.
  Home, notifications, followed groups, individual groups, followed Sources,
  and individual Sources use their dedicated current streams. REST refreshes
  fill gaps after focus changes, Android sleep, and network reconnects.
- Explore all 16 Worlds families, including books, culture, audio, video,
  photography, articles, events, software, routes, communities, and
  marketplace material. Native posts retain their structured facts, bridge
  provenance, and authoritative source link.
- Search bounded, server-approved Worlds providers and resolve a selected item
  through your own server before opening it locally.
- Manage your four reading shelves, move books between them, and track progress
  by page or percentage. Shelf changes use the quiet book-library API and do
  not create timeline posts. Reviews, comments, and quotations remain separate,
  explicit federated publishing actions.
- Record GPS paths in the foreground, pause and resume without joining separate
  track segments, recover an unfinished on-device draft, and import or export
  bounded GPX files. A route is uploaded and published only after reviewing its
  path, metadata, and visibility and accepting a precise-location confirmation.
- Read a combined followed-Sources timeline; list, find, preview, follow, and
  unfollow publications, channels, RSS or Atom feeds, and federated source
  actors.
- Discover groups, join or leave them, read their discussions, and post to a
  group while honoring posting, follow, moderation, and federation policy
  returned by the server.
- Compose posts, replies, quote reposts, polls, content warnings, and
  visibility-limited posts.
- Use server-supported reactions, including emoji reactions and positive or
  negative reactions.
- Vote in polls, read event details, and explicitly join, request to join, or
  leave events.
- Read notifications for ordinary activity, groups, emoji reactions, polls,
  event reminders, event updates, and participation requests.
- Preview linked pages from server-supplied titles, descriptions, providers,
  and images; compatible servers without rich-card data retain a tappable link
  fallback.
- Open a status thread, open attached images in a full-screen zoomable viewer,
  and play server-provided audio or video with guarded native controls.

On Android, the app asks once after the first account becomes active whether
to enable background notifications. The choice can be changed later under
Options → App settings.

GPS path recording asks for foreground location only when **Start recording**
is pressed. It does not request background or always-on location access. Keep
the route screen and app open while recording. The local preview uses no map
tiles; opening the starting point in OpenStreetMap is a separate action.

The bottom navigation is Home, Group feed, Groups, New post, Notifications,
and Options. Post controls are icon-only and finger-sized to keep the feed
compact without making actions hard to tap.

## Privacy and connection security

The app communicates directly with the server you select; it has no analytics
or advertising SDK. Login tokens are stored in the operating system's secure
credential storage. Non-secret account metadata may be retained locally to
restore the selected account, while logging out removes both the token and that
metadata.

Remote servers must use HTTPS. Plain HTTP is accepted only for local Android
development addresses such as `10.0.2.2` and `localhost`.

Live connections use the streaming origin advertised by the selected server,
with a same-origin fallback for older compatible hosts. OAuth tokens are sent
as a negotiated WebSocket subprotocol and are never placed in streaming URLs.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the full policy.

## Requirements

- Node.js 20 or newer and npm.
- For Android builds: OpenJDK 17 and the Android SDK command-line tools,
  platform-tools, and build tools.

This repository uses Expo SDK 57, React 19, React Native 0.86, TypeScript, and
a checked-in Android project. Android's application id is
`org.brokenlamp.hootunfathomably`.

## Install and develop

```bash
npm ci
npm start
```

Run the local Android project on an attached device or emulator:

```bash
npm run android
```

The Android command uses `build_scripts/android-env.sh` to locate Java 17 and
the Android SDK. On macOS, run `npm run ios` for the iOS target. The app uses
native Expo modules, so the local native project rather than Expo Go is the
supported workflow.

### Build on Debian or Ubuntu

The [`build_scripts`](build_scripts) directory contains Linux helpers intended
for Debian, Ubuntu, and related distributions:

- [`debian-build-hoot-mobile-android.sh`](build_scripts/debian-build-hoot-mobile-android.sh)
  locates Java 17, installs the project dependencies and Android SDK components,
  runs Expo prebuild, and creates the release APK.
- [`debian-test-hoot-mobile-android.sh`](build_scripts/debian-test-hoot-mobile-android.sh)
  creates or starts an Android emulator and runs the install-and-launch smoke
  test against the built APK.
- [`android-env.sh`](build_scripts/android-env.sh) supplies the same Java and
  Android SDK environment when running local Expo Android commands.

Run the build and emulator smoke test from the repository root:

```bash
./build_scripts/debian-build-hoot-mobile-android.sh
./build_scripts/debian-test-hoot-mobile-android.sh
```

The scripts do not run `apt-get` by default. On a machine where you want them
to install the required Debian/Ubuntu host packages, opt in explicitly:

```bash
HOOT_UNFATHOMABLY_INSTALL_SYSTEM_DEPS=1 \
  ./build_scripts/debian-build-hoot-mobile-android.sh

HOOT_UNFATHOMABLY_INSTALL_EMULATOR_DEPS=1 \
  ./build_scripts/debian-test-hoot-mobile-android.sh
```

The resulting APK is written under
`android/app/build/outputs/apk/release/`. The `npm run build:android` command is
a wrapper for the Debian/Ubuntu build helper.

## Validate a release

Run the release gate before publishing a build:

```bash
npm run verify:release
```

It runs strict ESLint and TypeScript checks, the Jest suite, Expo dependency
and project diagnostics, a complete dependency-tree check, and a production
dependency audit. Expo's current Metro release includes `image-size` without
an upstream patched release for two build-time denial-of-service advisories.
The install step applies exact ICNS, HEIF, and JXL loop guards, and the release
gate accepts those advisories only when the audited package version and every
guard are present. Any other advisory still fails the build.

The release suite uses canonical Unfathomably 3.5, Rebased, and Pleroma
fixtures. It covers the Mastodon-compatible v1 REST and streaming APIs plus Worlds, Sources,
groups, native metadata, book libraries, GPX routes, polls, events, quote
reposts, media, and emoji
reactions. It also requires capability-degraded Rebased and Pleroma fixtures
that omit every optional extension while preserving baseline login, feeds,
discussions, replies, reposts, favourites, and notifications. A strict contract
check rejects retired service imports, old API routes, and server-version
branching; the only retained pre-migration fixture verifies that existing users
are moved safely away from an obsolete saved API URL.

The exact compatibility boundary and intentional mobile exclusions are in
[UNFATHOMABLY-COMPATIBILITY.md](UNFATHOMABLY-COMPATIBILITY.md).

Build and smoke-test the Android release APK:

```bash
npm run build:android
npm run smoke:android -- android/app/build/outputs/apk/release/app-release.apk
```

The smoke check installs the APK on an attached device or running emulator,
launches it, confirms the app reaches the foreground, and rejects fresh
package-scoped Android, React Native, or ANR failures. If more than one device
is connected, set `ANDROID_SERIAL` first.

For complete Android environment, emulator, and notification-permission
instructions, see [COMPILE-ANDROID.MD](COMPILE-ANDROID.MD).

## Project status

Hoot Unfathomably is intended to be a public, production-focused client. The
codebase includes automated unit tests and Android release smoke validation;
real-server testing should avoid unsolicited public posts and use an account or
test instance you control for write-path verification.

## License

See [LICENSE](LICENSE).

<!-- end of README.md -->
