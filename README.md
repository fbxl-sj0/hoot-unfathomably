# Hoot Unfathomably

Hoot Unfathomably is a mobile client for the Unfathomably Fediverse stack. It
keeps Hoot's compact, readable post cards while adding a normal home timeline,
group discussions, and the Mastodon-compatible features supported by
[unfathomably-be](https://github.com/fbxl-sj0/unfathomably-be) and
[unfathomably-fe](https://github.com/fbxl-sj0/unfathomably-fe).

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
- Discover groups, join or leave them, read their discussions, and post to a
  group.
- Compose posts, replies, quote reposts, and reposts.
- Use server-supported reactions, including emoji reactions and positive or
  negative reactions.
- Read notifications and your own account timeline.
- Preview linked pages from server-supplied titles, descriptions, providers,
  and images; compatible servers without rich-card data retain a tappable link
  fallback.
- Open a status thread, and open attached images in a full-screen zoomable
  viewer so long images remain readable.

On Android, the app asks once after the first account becomes active whether
to enable background notifications. The choice can be changed later under
Options → App settings.

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
HOOT_MOBILE_INSTALL_SYSTEM_DEPS=1 \
  ./build_scripts/debian-build-hoot-mobile-android.sh

HOOT_MOBILE_INSTALL_EMULATOR_DEPS=1 \
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
dependency audit.

The release suite uses canonical Unfathomably, Rebased, and Pleroma fixtures.
It covers the Mastodon-compatible v1 API plus the group, quote-repost, and
emoji-reaction extensions used by those server families. It also requires
capability-degraded Rebased and Pleroma fixtures that omit every optional
extension while preserving the baseline feed and discussion actions. A strict
contract check rejects retired service imports, old API routes, and
server-version branching; the only retained pre-migration fixture verifies
that existing users are moved safely away from an obsolete saved API URL.

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
