/*
    Project: Hoot Unfathomably
    --------------------------

    File: apply-dependency-security-patches.js

    Purpose:

        Apply narrowly scoped security guards to build-time dependencies
        while an upstream package has no patched release.

    Responsibilities:

        - Verify the exact image-size release expected by Expo's Metro.
        - Prevent malformed ICNS and JXL entries from stalling Metro.
        - Fail closed if upstream source changes invalidate the patch.
        - Support a read-only check for the release security gate.

    This file intentionally does NOT contain:

        - Application image rendering logic.
        - Runtime handling of remote feed attachments.
        - General-purpose node_modules rewriting.
*/

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const imageSizeRoot = path.join(projectRoot, "node_modules", "image-size");
const expectedImageSizeVersion = "1.2.1";

const filePatches = [
  {
    fileName: "dist/types/icns.js",
    unsafeText: "imageOffset += imageHeader[1];",
    safeText: "imageOffset += imageHeader[1] > 0 ? imageHeader[1] : SIZE_HEADER;",
    expectedOccurrences: 2,
  },
  {
    fileName: "dist/types/jxl.js",
    unsafeText: "offset = jxlpBox.offset + jxlpBox.size;",
    safeText: "offset = jxlpBox.offset + (jxlpBox.size > 0 ? jxlpBox.size : 8);",
    expectedOccurrences: 1,
  },
];

const findBoxGuard = "offset += box.size > 0 ? box.size : 8;";

function occurrenceCount(text, searchText) {
  return text.split(searchText).length - 1;
}

function readImageSizeVersion() {
  const packagePath = path.join(imageSizeRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  if (packageJson.name !== "image-size") {
    throw new Error(`Unexpected package at ${packagePath}`);
  }

  return packageJson.version;
}

function verifyFindBoxGuard() {
  const utilsPath = path.join(imageSizeRoot, "dist", "types", "utils.js");
  const source = fs.readFileSync(utilsPath, "utf8");

  if (!source.includes(findBoxGuard)) {
    throw new Error(
      "image-size findBox does not contain the required zero-length box guard",
    );
  }
}

function applyOrVerifyPatch(filePatch, checkOnly) {
  const filePath = path.join(imageSizeRoot, filePatch.fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const safeOccurrences = occurrenceCount(source, filePatch.safeText);
  const unsafeOccurrences = occurrenceCount(source, filePatch.unsafeText);

  if (safeOccurrences === filePatch.expectedOccurrences && unsafeOccurrences === 0) {
    return false;
  }

  if (checkOnly) {
    throw new Error(`${filePatch.fileName} is missing its security guard`);
  }

  if (safeOccurrences !== 0 || unsafeOccurrences !== filePatch.expectedOccurrences) {
    throw new Error(
      `${filePatch.fileName} no longer matches the audited image-size source`,
    );
  }

  fs.writeFileSync(
    filePath,
    source.split(filePatch.unsafeText).join(filePatch.safeText),
    "utf8",
  );
  return true;
}

function main() {
  const checkOnly = process.argv.slice(2).includes("--check");
  const installedVersion = readImageSizeVersion();

  if (installedVersion !== expectedImageSizeVersion) {
    throw new Error(
      `Expected image-size ${expectedImageSizeVersion}, found ${installedVersion}. ` +
      "Re-audit the dependency before changing the supported version.",
    );
  }

  verifyFindBoxGuard();

  let changed = false;
  for (const filePatch of filePatches) {
    changed = applyOrVerifyPatch(filePatch, checkOnly) || changed;
  }

  if (checkOnly) {
    process.stdout.write("Dependency security patches are present.\n");
  } else if (changed) {
    process.stdout.write("Applied image-size parser security guards.\n");
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Dependency security patch failed: ${message}\n`);
  process.exit(1);
}

/* end of apply-dependency-security-patches.js */
