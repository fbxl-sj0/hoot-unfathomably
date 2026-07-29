/*
    Project: Hoot Mobile
    -------------------

    File: check-text-hygiene.js

    Purpose:

        Check Git-visible text files for basic release hygiene problems
        that are easy to miss in JavaScript-only linting.

    Responsibilities:

        - Inspect tracked and untracked non-ignored files.
        - Skip binary assets and generated binary artifacts.
        - Report trailing whitespace, missing final newlines, and merge
          conflict markers.
        - Report tab characters in source, config, and documentation files.

    This file intentionally does NOT contain:

        - Source formatting rules.
        - TypeScript or ESLint configuration.
        - Android build logic.
*/

const fs = require("fs");
const { spawnSync } = require("child_process");

const binaryExtensions = new Set([
  ".apk",
  ".avif",
  ".gif",
  ".heic",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".keystore",
  ".m4a",
  ".mp3",
  ".mp4",
  ".otf",
  ".p12",
  ".png",
  ".ttf",
  ".webp",
  ".zip",
]);

const noTabExtensions = new Set([
  ".css",
  ".d.ts",
  ".gradle",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".properties",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
]);

const skippedPathPrefixes = [
  "dist/",
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

function extensionOf(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function isBinaryFile(fileName, data) {
  if (binaryExtensions.has(extensionOf(fileName))) {
    return true;
  }

  return data.includes(0);
}

function disallowsTabs(fileName) {
  return noTabExtensions.has(extensionOf(fileName));
}

function shouldSkipTextHygiene(fileName) {
  return skippedPathPrefixes.some(prefix => fileName.startsWith(prefix));
}

function checkFile(fileName, problems) {
  if (shouldSkipTextHygiene(fileName)) {
    return;
  }

  if (!fs.existsSync(fileName)) {
    return;
  }

  const data = fs.readFileSync(fileName);

  if (isBinaryFile(fileName, data)) {
    return;
  }

  if (data.length > 0 && data[data.length - 1] !== 0x0a) {
    problems.push(`${fileName}: missing final newline`);
  }

  const lines = data.toString("utf8").split("\n");
  const checkTabs = disallowsTabs(fileName);

  lines.forEach((rawLine, index) => {
    if (index === lines.length - 1 && rawLine === "") {
      return;
    }

    const lineNumber = index + 1;
    const line = rawLine.replace(/\r$/, "");

    if (/[ \t]+$/.test(line)) {
      problems.push(`${fileName}:${lineNumber}: trailing whitespace`);
    }

    if (checkTabs && line.includes("\t")) {
      problems.push(`${fileName}:${lineNumber}: tab character`);
    }

    if (
      /^<<<<<<<( |$)/.test(line) ||
      /^=======$/.test(line) ||
      /^>>>>>>>( |$)/.test(line)
    ) {
      problems.push(`${fileName}:${lineNumber}: possible merge conflict marker`);
    }
  });
}

const problems = [];

for (const fileName of gitVisibleFiles()) {
  checkFile(fileName, problems);
}

if (problems.length > 0) {
  process.stderr.write("Text hygiene check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}

/* end of check-text-hygiene.js */
