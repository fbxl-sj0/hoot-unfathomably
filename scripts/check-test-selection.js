/*
    Project: Hoot Mobile
    -------------------

    File: check-test-selection.js

    Purpose:

        Check that release validation cannot silently run a focused or
        skipped Jest subset.

    Responsibilities:

        - Inspect tracked and untracked non-ignored test source files.
        - Reject focused Jest tests and suites.
        - Reject skipped Jest tests and suites.

    This file intentionally does NOT contain:

        - Jest execution logic.
        - Test coverage thresholds.
        - ESLint configuration.
*/

const fs = require("fs");
const { spawnSync } = require("child_process");

const testFilePattern = /(?:^|\/)(?:__tests__\/.+|.+\.test)\.[jt]sx?$/;
const selectedTestPattern =
  /\b(?:describe|it|test)\s*\.\s*(?:only|skip)\s*\(|\b(?:fdescribe|fit|xdescribe|xit|xtest)\s*\(/g;

const skippedPathPrefixes = [
  "android/",
  "dist/",
  "node_modules/",
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

function shouldSkipFile(fileName) {
  return skippedPathPrefixes.some(prefix => fileName.startsWith(prefix));
}

function isTestFile(fileName) {
  return testFilePattern.test(fileName);
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function checkFile(fileName, problems) {
  if (shouldSkipFile(fileName)) return;
  if (!isTestFile(fileName)) return;
  if (!fs.existsSync(fileName)) return;

  const text = fs.readFileSync(fileName, "utf8");
  const matches = text.matchAll(selectedTestPattern);

  for (const match of matches) {
    const lineNumber = lineNumberAt(text, match.index || 0);
    problems.push(
      `${fileName}:${lineNumber}: remove focused or skipped Jest selector '${match[0].trim()}'`,
    );
  }
}

const problems = [];

for (const fileName of gitVisibleFiles()) {
  checkFile(fileName, problems);
}

if (problems.length > 0) {
  process.stderr.write("Test selection check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}

/* end of check-test-selection.js */
