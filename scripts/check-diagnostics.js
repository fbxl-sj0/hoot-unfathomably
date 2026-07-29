/*
    Project: Hoot Mobile
    -------------------

    File: check-diagnostics.js

    Purpose:

        Check that app diagnostic output stays centralized.

    Responsibilities:

        - Inspect tracked and untracked non-ignored source files.
        - Allow console output only inside the central diagnostic helper.
        - Allow tests to spy on console behavior without weakening app code.

    This file intentionally does NOT contain:

        - Runtime logging implementation.
        - Remote telemetry transport.
        - ESLint configuration.
*/

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const checkedExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
]);

const skippedPathPrefixes = [
  "android/",
  "dist/",
  "node_modules/",
];

const allowedConsoleFiles = new Set([
  "utils/debugLog.ts",
]);

const consoleCallPattern = /\bconsole\.(debug|error|info|log|warn)\s*\(/g;

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

function extensionOf(fileName) {
  if (fileName.endsWith(".d.ts")) {
    return ".ts";
  }

  return path.extname(fileName).toLowerCase();
}

function isCheckedSourceFile(fileName) {
  return checkedExtensions.has(extensionOf(fileName));
}

function shouldSkipDiagnostics(fileName) {
  if (skippedPathPrefixes.some(prefix => fileName.startsWith(prefix))) {
    return true;
  }

  return fileName.includes("/__tests__/") || /\.test\.[jt]sx?$/.test(fileName);
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function checkFile(fileName, problems) {
  if (!isCheckedSourceFile(fileName)) return;
  if (shouldSkipDiagnostics(fileName)) return;
  if (allowedConsoleFiles.has(fileName)) return;
  if (!fs.existsSync(fileName)) return;

  const text = fs.readFileSync(fileName, "utf8");
  const matches = text.matchAll(consoleCallPattern);

  for (const match of matches) {
    const lineNumber = lineNumberAt(text, match.index || 0);
    problems.push(
      `${fileName}:${lineNumber}: use utils/debugLog.ts instead of direct ${match[0]}`,
    );
  }
}

const problems = [];

for (const fileName of gitVisibleFiles()) {
  checkFile(fileName, problems);
}

if (problems.length > 0) {
  process.stderr.write("Diagnostic logging check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}

/* end of check-diagnostics.js */
