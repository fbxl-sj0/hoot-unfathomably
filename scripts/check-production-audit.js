/*
    Project: Hoot Unfathomably
    --------------------------

    File: check-production-audit.js

    Purpose:

        Enforce the production dependency audit while recognizing an exact,
        locally mitigated build-tool advisory that has no upstream release.

    Responsibilities:

        - Run npm's production dependency audit at moderate severity.
        - Reject every advisory except two audited image-size parser findings.
        - Require the locally installed parser guards before accepting them.
        - Print the temporary exception clearly in release output.

    This file intentionally does NOT contain:

        - Dependency installation or upgrade logic.
        - Broad advisory suppression.
        - Runtime application security policy.
*/

const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const allowedAdvisorySources = new Set([1138808, 1138809]);
const allowedAdvisoryTitles = new Set([
  "image-size: ICNS parser allows denial of service through an infinite loop",
  "image-size: JXL and HEIF parsers allow denial of service through infinite loops",
]);

function run(command, args) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseAudit(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("npm audit did not return valid JSON");
  }
}

function advisoryObjects(audit) {
  const advisories = [];

  for (const vulnerability of Object.values(audit.vulnerabilities || {})) {
    for (const cause of vulnerability.via || []) {
      if (cause && typeof cause === "object") {
        advisories.push(cause);
      }
    }
  }

  return advisories;
}

function verifyAllowedAdvisories(audit) {
  const advisories = advisoryObjects(audit);
  const unexpected = advisories.filter(advisory => (
    !allowedAdvisorySources.has(advisory.source) ||
    !allowedAdvisoryTitles.has(advisory.title)
  ));

  if (unexpected.length > 0) {
    const summaries = unexpected.map(advisory => (
      `${advisory.name || "unknown"}: ${advisory.title || advisory.source}`
    ));
    throw new Error(`Unmitigated production advisories:\n  ${summaries.join("\n  ")}`);
  }

  const observedSources = new Set(advisories.map(advisory => advisory.source));
  for (const allowedSource of allowedAdvisorySources) {
    if (!observedSources.has(allowedSource)) {
      throw new Error(
        `Expected temporary image-size advisory ${allowedSource} was not reported. ` +
        "Remove or re-audit this exception.",
      );
    }
  }
}

function main() {
  const patchCheck = run(
    process.execPath,
    [path.join("scripts", "apply-dependency-security-patches.js"), "--check"],
  );

  if (patchCheck.status !== 0) {
    process.stderr.write(patchCheck.stderr || patchCheck.stdout);
    process.exit(patchCheck.status || 1);
  }

  const auditResult = run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["audit", "--omit=dev", "--audit-level=moderate", "--json"],
  );
  const audit = parseAudit(auditResult.stdout);

  if (auditResult.status === 0) {
    process.stdout.write("Production dependency audit found no advisories.\n");
    return;
  }

  verifyAllowedAdvisories(audit);
  process.stdout.write(
    "Production audit contains only the two image-size build-time advisories.\n" +
    "Their ICNS, HEIF, and JXL infinite-loop paths are locally guarded.\n",
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Production dependency audit failed: ${message}\n`);
  process.exit(1);
}

/* end of check-production-audit.js */
