/*
    Project: Hoot Mobile
    -------------------

    File: check-deprecated-packages.js

    Purpose:

        Verify that Hoot's reproducible dependency graph does not contain
        package metadata marked as deprecated.

    Responsibilities:

        - Inspect package-lock.json for deprecated package entries
        - Inspect installed node_modules package metadata
        - Fail with package names, versions, and deprecation messages

    This file intentionally does NOT contain:

        - package installation logic
        - vulnerability auditing
        - package upgrade recommendations
*/

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const maxReportedProblems = 40;

function readJsonFile(fileName) {
  return JSON.parse(fs.readFileSync(fileName, "utf8"));
}

function hasDeprecatedMetadata(pkg) {
  return Object.prototype.hasOwnProperty.call(pkg, "deprecated");
}

function formatDeprecatedMetadata(value) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (value === true) {
    return "deprecated";
  }

  return JSON.stringify(value);
}

function packageLabel(pkg, fallbackName) {
  const name = typeof pkg.name === "string" && pkg.name.length > 0
    ? pkg.name
    : fallbackName;
  const version = typeof pkg.version === "string" && pkg.version.length > 0
    ? `@${pkg.version}`
    : "";

  return `${name}${version}`;
}

function checkPackageLock(problems) {
  const lockPath = path.join(projectRoot, "package-lock.json");
  const lock = readJsonFile(lockPath);
  const packages = lock.packages;

  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    throw new Error("package-lock.json does not contain a packages object");
  }

  for (const [packagePath, pkg] of Object.entries(packages)) {
    if (!pkg || typeof pkg !== "object" || !hasDeprecatedMetadata(pkg)) {
      continue;
    }

    problems.push({
      source: "package-lock.json",
      packagePath: packagePath || ".",
      label: packageLabel(pkg, packagePath || "."),
      message: formatDeprecatedMetadata(pkg.deprecated),
    });
  }
}

function walkPackageJsonFiles(directory, onPackageJson) {
  let entries;

  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".bin") continue;
      walkPackageJsonFiles(fullPath, onPackageJson);
      continue;
    }

    if (entry.isFile() && entry.name === "package.json") {
      onPackageJson(fullPath);
    }
  }
}

function checkInstalledPackages(problems) {
  const nodeModulesPath = path.join(projectRoot, "node_modules");

  if (!fs.existsSync(nodeModulesPath)) {
    throw new Error("node_modules is missing. Run npm ci before dependency checks.");
  }

  walkPackageJsonFiles(nodeModulesPath, packageJsonPath => {
    let pkg;

    try {
      pkg = readJsonFile(packageJsonPath);
    } catch {
      problems.push({
        source: "node_modules",
        packagePath: path.relative(projectRoot, packageJsonPath),
        label: path.relative(projectRoot, packageJsonPath),
        message: "package.json could not be parsed",
      });
      return;
    }

    if (!pkg || typeof pkg !== "object" || !hasDeprecatedMetadata(pkg)) {
      return;
    }

    problems.push({
      source: "node_modules",
      packagePath: path.relative(projectRoot, packageJsonPath),
      label: packageLabel(pkg, path.relative(projectRoot, packageJsonPath)),
      message: formatDeprecatedMetadata(pkg.deprecated),
    });
  });
}

const problems = [];

checkPackageLock(problems);
checkInstalledPackages(problems);

if (problems.length > 0) {
  process.stderr.write("Deprecated package metadata check failed:\n");
  for (const problem of problems.slice(0, maxReportedProblems)) {
    process.stderr.write(
      `  ${problem.source}: ${problem.label} (${problem.packagePath}): ${problem.message}\n`,
    );
  }

  if (problems.length > maxReportedProblems) {
    process.stderr.write(
      `  ...and ${problems.length - maxReportedProblems} more deprecated package entries\n`,
    );
  }

  process.exit(1);
}

/* end of check-deprecated-packages.js */
