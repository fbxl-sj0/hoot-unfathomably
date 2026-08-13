/*
    Project: Hoot Unfathomably
    --------------------------

    File: probe-fediverse-compatibility.js

    Purpose:

        Verify the app's public compatibility boundary against live servers.

    Responsibilities:

        - Read public instance metadata and timeline response shapes
        - Identify Unfathomably, Rebased, Pleroma, Akkoma, and Mastodon
        - Confirm Soapbox and Pleroma FE theme configuration where advertised
        - Report authentication-gated public timelines as valid server policy

    This file intentionally does NOT contain:

        - Credentials or authorization headers
        - POST, PUT, PATCH, or DELETE requests
        - Account registration or OAuth application creation
*/

"use strict";

const MAX_RESPONSE_CHARACTERS = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;

const DEFAULT_TARGETS = [
  {
    expectedFamily: "unfathomably",
    label: "FBXL Social",
    origin: "https://social.fbxl.net",
  },
  {
    expectedFamily: "rebased",
    label: "TECI Social (Soapbox)",
    origin: "https://social.teci.world",
    soapbox: true,
  },
  {
    expectedFamily: "pleroma",
    label: "Poast (Soapbox)",
    origin: "https://poa.st",
    soapbox: true,
  },
  {
    expectedFamily: "pleroma",
    label: "Pleroma/Soykaf",
    origin: "https://pleroma.soykaf.com",
  },
  {
    expectedFamily: "pleroma",
    label: "Udongein",
    origin: "https://udongein.xyz",
  },
  {
    expectedFamily: "akkoma",
    label: "Outmo.de",
    origin: "https://outmo.de",
  },
  {
    expectedFamily: "mastodon",
    label: "Fosstodon",
    origin: "https://fosstodon.org",
  },
  {
    expectedFamily: "mastodon",
    label: "mstdn.social",
    origin: "https://mstdn.social",
  },
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedOrigin(value) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname.includes(".")
  ) {
    throw new Error(`Unsafe live-probe origin: ${value}`);
  }

  return parsed.origin;
}

function instanceFeatures(instance) {
  const features = instance?.pleroma?.metadata?.features;
  return Array.isArray(features)
    ? features.filter(feature => typeof feature === "string")
    : [];
}

function detectFamily(instance) {
  const version = typeof instance?.version === "string"
    ? instance.version
    : "";
  const features = new Set(instanceFeatures(instance));
  const identity = [
    version,
    instance?.unfathomably?.backend,
  ].filter(value => typeof value === "string").join(" ");

  if (/unfathomably/i.test(identity)) return "unfathomably";
  if (/akkoma/i.test(identity) || features.has("akkoma_api")) return "akkoma";
  if (/rebased/i.test(identity) || /\+soapbox\b/i.test(version)) return "rebased";
  if (/pleroma/i.test(identity) || features.has("pleroma_api")) return "pleroma";
  if (/^\d+\.\d+(?:\.\d+)?(?:[-+].*)?$/i.test(version)) return "mastodon";
  return "unknown";
}

async function readPublicJson(origin, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${origin}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Hoot-Unfathomably-Compatibility-Probe/1.0",
      },
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      throw new Error(`${path} exceeded the live-probe response limit`);
    }

    let json;
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }

    return {
      contentType: response.headers.get("content-type") || "",
      json,
      status: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

function validateStatusShape(status) {
  if (!isRecord(status)) return "status is not an object";

  const requiredStrings = ["id", "content", "created_at"];
  for (const field of requiredStrings) {
    if (typeof status[field] !== "string") {
      return `status.${field} is not a string`;
    }
  }

  const requiredCounts = [
    "favourites_count",
    "reblogs_count",
    "replies_count",
  ];
  for (const field of requiredCounts) {
    if (typeof status[field] !== "number") {
      return `status.${field} is not a number`;
    }
  }

  if (!isRecord(status.account)) return "status.account is not an object";
  if (typeof status.account.id !== "string") return "status.account.id is not a string";
  if (!Array.isArray(status.media_attachments)) {
    return "status.media_attachments is not an array";
  }
  if (!Array.isArray(status.mentions)) return "status.mentions is not an array";

  return undefined;
}

function hasSoapboxConfiguration(value) {
  if (!isRecord(value) || !isRecord(value.soapbox_fe)) return false;
  const config = value.soapbox_fe;

  return typeof config.brandColor === "string" ||
    typeof config.accentColor === "string" ||
    isRecord(config.colors);
}

function pleromaThemeName(value) {
  if (!isRecord(value) || !isRecord(value.pleroma_fe)) return undefined;
  const themeName = value.pleroma_fe.theme;

  return typeof themeName === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(themeName)
    ? themeName
    : undefined;
}

function hasPleromaThemeColors(value) {
  if (!isRecord(value)) return false;
  const theme = isRecord(value.theme) ? value.theme : value.source;
  if (!isRecord(theme) || !isRecord(theme.colors)) return false;

  return ["accent", "bg", "text"].every(
    key => typeof theme.colors[key] === "string",
  );
}

function advertisedStreamingOrigin(instance) {
  const value = instance?.configuration?.urls?.streaming ||
    instance?.urls?.streaming_api;
  if (typeof value !== "string") return "same-origin";

  try {
    const parsed = new URL(value);
    return parsed.protocol === "wss:" || parsed.protocol === "https:"
      ? "advertised"
      : "unsafe";
  } catch {
    return "unsafe";
  }
}

async function probeTarget(target) {
  const origin = normalizedOrigin(target.origin);
  const instance = await readPublicJson(origin, "/api/v1/instance");
  if (instance.status !== 200 || !isRecord(instance.json)) {
    throw new Error(`v1 instance endpoint returned ${instance.status}`);
  }
  if (typeof instance.json.version !== "string") {
    throw new Error("v1 instance response omitted version");
  }

  const family = detectFamily(instance.json);
  if (target.expectedFamily && family !== target.expectedFamily) {
    throw new Error(`expected ${target.expectedFamily}, detected ${family}`);
  }

  const streaming = advertisedStreamingOrigin(instance.json);
  if (streaming === "unsafe") {
    throw new Error("instance advertised an unsafe streaming origin");
  }

  const [v2, timeline, frontend, frontendV1, staticConfig] = await Promise.all([
    readPublicJson(origin, "/api/v2/instance"),
    readPublicJson(origin, "/api/v1/timelines/public?local=true&limit=1"),
    readPublicJson(origin, "/api/pleroma/frontend_configurations"),
    readPublicJson(origin, "/api/v1/pleroma/frontend_configurations"),
    readPublicJson(origin, "/instance/soapbox.json"),
  ]);

  let timelineResult;
  if (timeline.status === 401 || timeline.status === 403) {
    timelineResult = "auth-required";
  } else if (timeline.status === 200 && Array.isArray(timeline.json)) {
    const first = timeline.json[0];
    const shapeError = first ? validateStatusShape(first) : undefined;
    if (shapeError) throw new Error(shapeError);
    timelineResult = `${timeline.json.length}-status`;
  } else {
    throw new Error(`public timeline returned ${timeline.status}`);
  }

  const soapbox = hasSoapboxConfiguration(frontend.json) ||
    hasSoapboxConfiguration(frontendV1.json) ||
    hasSoapboxConfiguration(staticConfig.json);
  if (target.soapbox && !soapbox) {
    throw new Error("Soapbox frontend configuration was not detected");
  }

  let theme = soapbox ? "soapbox" : "fallback";
  const themeName = [frontend.json, frontendV1.json]
    .map(pleromaThemeName)
    .find(candidate => !!candidate);
  if (!soapbox && themeName) {
    const themeResponse = await readPublicJson(
      origin,
      `/static/themes/${encodeURIComponent(themeName)}.json`,
    );
    if (themeResponse.status === 200 && hasPleromaThemeColors(themeResponse.json)) {
      theme = "pleroma";
    }
  }

  return {
    family,
    origin,
    soapbox,
    streaming,
    theme,
    timeline: timelineResult,
    v2: v2.status === 200 && isRecord(v2.json) ? "available" : "optional",
    version: instance.json.version,
  };
}

function commandLineTargets(arguments_) {
  if (arguments_.length === 0) return DEFAULT_TARGETS;

  return arguments_.map(value => ({
    label: normalizedOrigin(value),
    origin: normalizedOrigin(value),
  }));
}

async function main(arguments_ = process.argv.slice(2)) {
  const targets = commandLineTargets(arguments_);
  let failed = false;

  for (const target of targets) {
    try {
      const result = await probeTarget(target);
      process.stdout.write(
        `PASS ${target.label}: ${result.family} ${result.version}; ` +
        `timeline=${result.timeline}; v2=${result.v2}; ` +
        `theme=${result.theme}; ` +
        `streaming=${result.streaming}\n`,
      );
    } catch (error) {
      failed = true;
      process.stderr.write(
        `FAIL ${target.label}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  if (failed) process.exitCode = 1;
}

module.exports = {
  DEFAULT_TARGETS,
  detectFamily,
  hasPleromaThemeColors,
  pleromaThemeName,
  probeTarget,
  validateStatusShape,
};

if (require.main === module) {
  void main();
}

/* end of probe-fediverse-compatibility.js */
