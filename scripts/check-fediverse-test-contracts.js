/*
    Project: Hoot Unfathomably
    --------------------------

    File: check-fediverse-test-contracts.js

    Purpose:

        Keep the release suite centered on the app's supported
        Unfathomably, Rebased, Pleroma, Akkoma, and Mastodon contracts.

    Responsibilities:

        - Reject imports from the retired pre-Fediverse service.
        - Reject retired API-route and server-version fixtures.
        - Require the canonical fixtures and active contract suites.
        - Preserve one explicit startup-migration fixture.

    This file intentionally does NOT contain:

        - Jest execution logic.
        - Live-server credentials.
        - Network requests.
*/

const fs = require("fs");
const { spawnSync } = require("child_process");

const testFilePattern = /(?:^|\/)(?:__tests__\/.+|.+\.test)\.[jt]sx?$/;
const skippedPathPrefixes = ["android/", "dist/", "node_modules/"];
const migrationFixture = {
  fileName: "__tests__/App.test.tsx",
  pattern: /\/api\/unstable/g,
  requiredCount: 1,
};
const forbiddenPatterns = [
  {
    pattern: /services\/LotideService/g,
    reason: "replace the retired service with UnfathomablyService",
  },
  {
    pattern: /lotide\.fbxl\.net/gi,
    reason: "use a canonical supported Fediverse fixture",
  },
  {
    pattern: /\/api\/stable/g,
    reason: "replace the retired API route with a Fediverse v1 contract",
  },
  {
    pattern: /\bapiVersion\s*:\s*(?:17|18)\b/g,
    reason: "remove retired server-version branching",
  },
  {
    pattern: /\bLotide\s+0\.\d+/gi,
    reason: "remove retired server-version matrices",
  },
];
const requiredContractFiles = [
  "testing/fediverseFixtures.ts",
  "services/__tests__/UnfathomablyService.test.ts",
  "scripts/__tests__/FediverseCompatibilityProbe.test.ts",
  "components/__tests__/StatusCard.test.tsx",
  "screens/__tests__/FediverseFeedScreens.test.tsx",
  "screens/__tests__/FediverseGroupsScreens.test.tsx",
  "screens/__tests__/FediverseDiscussionScreens.test.tsx",
  "screens/__tests__/FediverseAccountScreens.test.tsx",
  "screens/__tests__/FediverseOptionsScreen.test.tsx",
];
const requiredFamilies = [
  "akkoma",
  "mastodon",
  "pleroma",
  "rebased",
  "unfathomably",
];
const degradedContractFiles = [
  "components/__tests__/StatusCard.test.tsx",
  "screens/__tests__/FediverseFeedScreens.test.tsx",
  "services/__tests__/UnfathomablyService.test.ts",
];

function gitVisibleFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "buffer" },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr.toString("utf8"));
    process.exit(result.status || 1);
  }

  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function shouldInspect(fileName) {
  return (
    testFilePattern.test(fileName) &&
    !skippedPathPrefixes.some(prefix => fileName.startsWith(prefix)) &&
    fs.existsSync(fileName)
  );
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function reportMatches(fileName, text, pattern, reason, problems) {
  for (const match of text.matchAll(pattern)) {
    problems.push(
      `${fileName}:${lineNumberAt(text, match.index || 0)}: ${reason}`,
    );
  }
}

const problems = [];
const visibleFiles = new Set(gitVisibleFiles());

for (const fileName of visibleFiles) {
  if (!shouldInspect(fileName)) continue;

  const text = fs.readFileSync(fileName, "utf8");

  for (const forbidden of forbiddenPatterns) {
    reportMatches(
      fileName,
      text,
      forbidden.pattern,
      forbidden.reason,
      problems,
    );
  }

  const retiredRouteMatches = [...text.matchAll(/\/api\/unstable/g)];
  const isMigrationFixture = fileName === migrationFixture.fileName;

  if (!isMigrationFixture && retiredRouteMatches.length > 0) {
    for (const match of retiredRouteMatches) {
      problems.push(
        `${fileName}:${lineNumberAt(text, match.index || 0)}: keep retired API routes only in the startup migration test`,
      );
    }
  }
}

for (const fileName of requiredContractFiles) {
  if (!visibleFiles.has(fileName) || !fs.existsSync(fileName)) {
    problems.push(`${fileName}: required Fediverse contract suite is missing`);
  }
}

const fixtureText = fs.existsSync("testing/fediverseFixtures.ts")
  ? fs.readFileSync("testing/fediverseFixtures.ts", "utf8")
  : "";

for (const family of requiredFamilies) {
  if (!fixtureText.includes(`${family}: {`)) {
    problems.push(
      `testing/fediverseFixtures.ts: missing '${family}' server fixture`,
    );
  }
}

if (!fixtureText.includes("export function makeDegradedStatus(")) {
  problems.push(
    "testing/fediverseFixtures.ts: missing capability-degraded Fediverse fixture",
  );
}

for (const fileName of degradedContractFiles) {
  const text = fs.existsSync(fileName)
    ? fs.readFileSync(fileName, "utf8")
    : "";
  if (!text.includes("makeDegradedStatus")) {
    problems.push(
      `${fileName}: missing capability-degraded Fediverse coverage`,
    );
  }
}

if (fs.existsSync(migrationFixture.fileName)) {
  const migrationText = fs.readFileSync(migrationFixture.fileName, "utf8");
  const count = [...migrationText.matchAll(migrationFixture.pattern)].length;

  if (count !== migrationFixture.requiredCount) {
    problems.push(
      `${migrationFixture.fileName}: expected exactly one retired API startup-migration fixture; found ${count}`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write("Fediverse test-contract check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}

/* end of check-fediverse-test-contracts.js */
