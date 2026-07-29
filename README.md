# Hoot Unfathomably

Hoot Unfathomably is a mobile client for the Unfathomably Fediverse stack. It
keeps Hoot's compact, readable post cards while adding a normal home timeline,
group discussions, and the Mastodon-compatible features supported by
[unfathomably-be](https://github.com/fbxl-sj0/unfathomably-be) and
[unfathomably-fe](https://github.com/fbxl-sj0/unfathomably-fe).

It connects directly to an Unfathomably server. Compatible Pleroma and Rebased
servers provide the normal timeline and discussion experience; group features
appear when the server provides the Unfathomably-compatible group endpoints.

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
- Open a status thread, and open attached images in a full-screen zoomable
  viewer so long images remain readable.

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

## Validate a release

Run the release gate before publishing a build:

```bash
npm run verify:release
```

It runs strict ESLint and TypeScript checks, the Jest suite, Expo dependency
and project diagnostics, a complete dependency-tree check, and a production
dependency audit.

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
