/*
    Project: Hoot Mobile
    -------------------

    File: check-source-structure.js

    Purpose:

        Check Git-visible source files for the project header and footer
        structure used by long-lived Hoot code.

    Responsibilities:

        - Inspect tracked and untracked non-ignored source files.
        - Skip native/generated output paths owned by other tooling.
        - Report missing Hoot file headers.
        - Report missing exact end-of-file markers.

    This file intentionally does NOT contain:

        - Source formatting rules.
        - TypeScript or ESLint configuration.
        - Android build logic.
*/

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const sourceExtensions = new Set([
  ".js",
  ".jsx",
  ".sh",
  ".ts",
  ".tsx",
]);

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

function extensionOf(fileName) {
  if (fileName.endsWith(".d.ts")) {
    return ".ts";
  }

  return path.extname(fileName).toLowerCase();
}

function isSourceFile(fileName) {
  return sourceExtensions.has(extensionOf(fileName));
}

function shouldSkipSourceStructure(fileName) {
  return skippedPathPrefixes.some(prefix => fileName.startsWith(prefix));
}

function expectedFooter(fileName) {
  const baseName = path.basename(fileName);

  if (extensionOf(fileName) === ".sh") {
    return `# end of ${baseName}`;
  }

  return `/* end of ${baseName} */`;
}

function checkFile(fileName, problems) {
  if (shouldSkipSourceStructure(fileName)) return;
  if (!isSourceFile(fileName)) return;
  if (!fs.existsSync(fileName)) return;

  const text = fs.readFileSync(fileName, "utf8");
  const lines = text.split("\n");
  const headerWindow = lines.slice(0, 30).join("\n");
  const lastLine = lines[lines.length - 1] === ""
    ? lines[lines.length - 2]
    : lines[lines.length - 1];

  if (!headerWindow.includes("Project: Hoot Mobile")) {
    problems.push(`${fileName}: missing Hoot Mobile file header`);
  }

  const footer = expectedFooter(fileName);
  if (lastLine !== footer) {
    problems.push(`${fileName}: missing footer: ${footer}`);
  }
}

const problems = [];

for (const fileName of gitVisibleFiles()) {
  checkFile(fileName, problems);
}

if (problems.length > 0) {
  process.stderr.write("Source structure check failed:\n");
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}

/* end of check-source-structure.js */
